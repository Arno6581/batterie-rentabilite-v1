// ============================================================
// SOLAR MODEL - THEORETICAL PRODUCTION (96 points fallback)
// ============================================================

function orientationTiltFactor(tilt, azimuth){
  const azimuthDiff = Math.min(
    Math.abs(azimuth - 180),
    360 - Math.abs(azimuth - 180)
  );
  const tiltDiff = Math.abs(tilt - 35);
  let factor = 1 - (azimuthDiff / 180) * 0.35 - (tiltDiff / 90) * 0.15;
  return Math.max(0.5, Math.min(1.05, factor));
}

function dailyProductionForGroup(group, monthIndex){
  const monthlyBase = MONTHLY_KWH_PER_KWC[monthIndex];
  const kWc = (group.panelPower * group.panelCount) / 1000;
  const factor = orientationTiltFactor(group.tilt, group.azimuth);
  const monthlyProd = monthlyBase * kWc * factor;
  const daysInMonth = new Date(2026, monthIndex + 1, 0).getDate();
  return monthlyProd / daysInMonth;
}

function totalDailyProduction(pvGroups, monthIndex){
  return pvGroups.reduce((sum, g) => sum + dailyProductionForGroup(g, monthIndex), 0);
}

function hourlyProductionCurve(dailyTotalKWh, avgAzimuth, monthIndex){
  const daylightLength = DAYLENGTH_BY_MONTH[monthIndex];
  const azimuthShift = (avgAzimuth - 180) / 180 * 1.5;
  const peakHour = 13 + azimuthShift;
  const start = peakHour - daylightLength / 2;
  const end = peakHour + daylightLength / 2;

  let weights = [];
  for(let i = 0; i < 96; i++){
    const h = i / 4;
    if(h >= start && h <= end){
      const x = (h - peakHour) / (daylightLength / 2);
      weights.push(Math.max(0, Math.cos(x * Math.PI / 2)));
    } else {
      weights.push(0);
    }
  }

  const sumW = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => sumW > 0 ? (dailyTotalKWh * w) / sumW : 0);
}

// ============================================================
// RECONSTRUCT CONSUMPTION FROM P1 (96 points)
// ============================================================

function reconstructConsumptionFromP1(entry){
  let hourlyConsumption = new Array(96).fill(0);

  const hasRealImport = entry.hourlyImport && entry.hourlyImport.reduce((a, b) => a + b, 0) > 0.05;
  const hasRealExport = entry.hourlyExport && entry.hourlyExport.reduce((a, b) => a + b, 0) > 0.05;
  const hasRealProd = entry.hourlyProduction && entry.hourlyProduction.reduce((a, b) => a + b, 0) > 0.05;

  if(hasRealImport && hasRealExport && hasRealProd){
    for(let i = 0; i < 96; i++){
      const prod = entry.hourlyProduction[i] || 0;
      const imp = entry.hourlyImport[i] || 0;
      const exp = entry.hourlyExport[i] || 0;
      hourlyConsumption[i] = Math.max(0, prod - exp + imp);
    }
  } else {
    // Fallback : Interpolation de la courbe type de 24 à 96 points
    const shape24 = baseLoadShape();
    let shape96 = [];
    for(let i = 0; i < 96; i++){
      shape96.push(shape24[Math.floor(i / 4)]);
    }
    const sumShape = shape96.reduce((a, b) => a + b, 0);
    const estimatedTotal = entry.grid + Math.max(0, (entry.pvProduction || 0) - entry.surplus);
    hourlyConsumption = shape96.map(v => (v / sumShape) * Math.max(estimatedTotal, 1));
  }

  return hourlyConsumption;
}

// ============================================================
// BATTERY SIMULATION (96 points - 15 minutes scale)
// ============================================================

function simulateDayWithBattery(productionCurve, consumptionCurve, battery){
  let soc = battery.capacity * 0.2; // Remplissage initial à 20%
  const maxSoc = battery.capacity;
  const minSoc = battery.capacity * 0.1;
  const maxPower15Min = battery.power * 0.25; // max charge/discharge energy in 15 mins (kW * 0.25h)
  const efficiency = battery.efficiency || 0.9;

  let gridImport = 0;
  let gridExport = 0;
  let socHistory = [];
  let hourly = [];

  for(let i = 0; i < 96; i++){
    const prod = productionCurve[i];
    const cons = consumptionCurve[i];
    let net = prod - cons; // en kWh
    let batteryFlow = 0;
    let hImport = 0;
    let hExport = 0;

    if(net > 0){
      // Excès solaire -> Charge
      const room = (maxSoc - soc) / efficiency;
      const charge = Math.min(maxPower15Min, net, room);
      batteryFlow = charge;
      soc += charge * efficiency;
      hExport = net - charge;
      gridExport += hExport;
    } else {
      // Déficit de consommation -> Décharge
      const deficit = -net;
      const available = soc - minSoc;
      const discharge = Math.min(maxPower15Min, deficit, Math.max(0, available));
      batteryFlow = -discharge;
      soc -= discharge;
      hImport = deficit - discharge;
      gridImport += hImport;
    }

    socHistory.push(soc);
    hourly.push({
      timeIndex: i,
      production: prod,
      consumption: cons,
      batteryFlow,
      gridImport: hImport,
      gridExport: hExport
    });
  }

  return { gridImport, gridExport, socHistory, hourly };
}

function simulateDayWithoutBattery(productionCurve, consumptionCurve){
  let gridImport = 0;
  let gridExport = 0;

  for(let i = 0; i < 96; i++){
    const net = productionCurve[i] - consumptionCurve[i];
    if(net > 0){
      gridExport += net;
    } else {
      gridImport += -net;
    }
  }

  return { gridImport, gridExport };
}

// ============================================================
// COST COMPUTATION
// ============================================================

function computeDailyCost(gridImport, gridExport, tariff){
  const cost = gridImport * tariff.consumption;
  const revenue = gridExport * tariff.injection;
  return cost - revenue;
}

// ============================================================
// MAIN SIMULATION RUNNER
// ============================================================

function getMonthIndexFromDate(dateStr){
  return new Date(dateStr).getMonth();
}

function runSimulationForEntry(entryIdx, battIdx){
  syncFormToProfile();

  const entry = currentProfile.p1Entries[entryIdx];
  const battery = currentProfile.batteryOffers[battIdx];

  if(!entry || !battery){
    alert("Merci de sélectionner un relevé P1 et une offre batterie.");
    return null;
  }

  const monthIndex = getMonthIndexFromDate(entry.date);

  // Production Curve
  let productionCurve;
  const hasRealProd = entry.hourlyProduction && entry.hourlyProduction.reduce((a, b) => a + b, 0) > 0.05;
  if(hasRealProd){
    productionCurve = entry.hourlyProduction;
  } else {
    const avgAzimuth = currentProfile.pvGroups.reduce((s, g) => s + g.azimuth, 0) /
      (currentProfile.pvGroups.length || 1);
    const dailyProd = entry.pvProduction || totalDailyProduction(currentProfile.pvGroups, monthIndex);
    productionCurve = hourlyProductionCurve(dailyProd, avgAzimuth, monthIndex);
  }

  // Consumption Curve
  let consumptionCurve = reconstructConsumptionFromP1(entry);

  // Simulations
  const without = simulateDayWithoutBattery(productionCurve, consumptionCurve);
  const withBatt = simulateDayWithBattery(productionCurve, consumptionCurve, battery);

  // ROI calculations
  const tariff = currentProfile.tariff;
  const costWithout = computeDailyCost(without.gridImport, without.gridExport, tariff);
  const costWith = computeDailyCost(withBatt.gridImport, withBatt.gridExport, tariff);
  const dailySavings = costWithout - costWith;
  const annualSavings = dailySavings * 365;
  const payback = annualSavings > 0 ? battery.cost / annualSavings : Infinity;

  return {
    entry,
    battery,
    productionCurve,
    consumptionCurve,
    without,
    withBatt,
    dailySavings,
    annualSavings,
    payback
  };
}

function runSimulation(){
  const entryIdx = parseInt(document.getElementById('simP1Select').value);
  const battIdx = parseInt(document.getElementById('simBattSelect').value);

  const res = runSimulationForEntry(entryIdx, battIdx);
  if(!res) return;

  document.getElementById('simResults').style.display = 'block';
  document.getElementById('comparisonResults').style.display = 'none';

  document.getElementById('resGridWithout').textContent = res.without.gridImport.toFixed(1);
  document.getElementById('resGridWith').textContent = res.withBatt.gridImport.toFixed(1);
  document.getElementById('resDailySavings').textContent = res.dailySavings.toFixed(2) + ' €';
  document.getElementById('resAnnualSavings').textContent = res.annualSavings.toFixed(0) + ' €';
  document.getElementById('resPayback').textContent = isFinite(res.payback) ?
    res.payback.toFixed(1) + ' ans' : 'N/A';

  // Render Charts
  renderRawChart(res);
  renderConsChart(res);
  renderSimChart(res);
  renderSocChart(res);
}

function runAllBatteriesComparison(){
  const entryIdx = parseInt(document.getElementById('simP1Select').value);

  if(isNaN(entryIdx) || currentProfile.p1Entries.length === 0){
    alert("Merci de sélectionner un relevé P1.");
    return;
  }

  if(currentProfile.batteryOffers.length === 0){
    alert("Aucune offre batterie enregistrée.");
    return;
  }

  document.getElementById('simResults').style.display = 'none';
  document.getElementById('comparisonResults').style.display = 'block';

  const tbody = document.querySelector('#comparisonTable tbody');
  tbody.innerHTML = '';

  currentProfile.batteryOffers.forEach((battery, idx) => {
    const res = runSimulationForEntry(entryIdx, idx);
    if(!res) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${battery.name}</td>
      <td>${battery.capacity} kWh</td>
      <td>${battery.cost} €</td>
      <td>${res.annualSavings.toFixed(0)} €</td>
      <td>${isFinite(res.payback) ? res.payback.toFixed(1) + ' ans' : 'N/A'}</td>
    `;
    tbody.appendChild(tr);
  });
}
