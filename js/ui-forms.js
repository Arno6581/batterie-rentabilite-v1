// ============================================================
// SYNC PROFILE <-> FORM
// ============================================================

function syncFormToProfile(){
  currentProfile.tariff.mode = document.getElementById('tariffMode').value;
  currentProfile.tariff.consumption = parseFloat(document.getElementById('tariffConsumption').value) || 0;
  currentProfile.tariff.injection = parseFloat(document.getElementById('tariffInjection').value) || 0;
  currentProfile.tariff.night = parseFloat(document.getElementById('tariffNight').value) || 0;
  currentProfile.tariff.nightStart = document.getElementById('nightStart').value;
  currentProfile.tariff.nightEnd = document.getElementById('nightEnd').value;

  // PV Groups
  currentProfile.pvGroups = [];
  document.querySelectorAll('.pv-group-box').forEach(box => {
    currentProfile.pvGroups.push({
      panelPower: parseFloat(box.querySelector('.pv-power').value) || 0,
      panelCount: parseInt(box.querySelector('.pv-count').value) || 0,
      tilt: parseFloat(box.querySelector('.pv-tilt').value) || 0,
      azimuth: parseFloat(box.querySelector('.pv-azimuth').value) || 0
    });
  });

  // Equipment
  currentProfile.equipment.washingMachine = {
    enabled: document.getElementById('wmEnabled').checked,
    power: parseFloat(document.getElementById('wmPower').value) || 0,
    duration: parseFloat(document.getElementById('wmDuration').value) || 0,
    hour: parseInt(document.getElementById('wmHour').value) || 0
  };

  currentProfile.equipment.dishwasher = {
    enabled: document.getElementById('dwEnabled').checked,
    power: parseFloat(document.getElementById('dwPower').value) || 0,
    duration: parseFloat(document.getElementById('dwDuration').value) || 0,
    hour: parseInt(document.getElementById('dwHour').value) || 0
  };

  currentProfile.equipment.dryer = {
    enabled: document.getElementById('dryEnabled').checked,
    power: parseFloat(document.getElementById('dryPower').value) || 0,
    duration: parseFloat(document.getElementById('dryDuration').value) || 0,
    hour: parseInt(document.getElementById('dryHour').value) || 0
  };

  // AC Units
  currentProfile.equipment.ac = [];
  document.querySelectorAll('.ac-box').forEach(box => {
    const hoursStr = box.querySelector('.ac-hours').value;
    const hours = hoursStr.split(',')
      .map(h => parseInt(h.trim()))
      .filter(h => !isNaN(h));
    currentProfile.equipment.ac.push({
      name: box.querySelector('.ac-name').value,
      power: parseFloat(box.querySelector('.ac-power').value) || 0,
      hours: hours
    });
  });

  // EV
  currentProfile.equipment.ev = {
    enabled: document.getElementById('evEnabled').checked,
    capacity: parseFloat(document.getElementById('evCapacity').value) || 0,
    power: parseFloat(document.getElementById('evPower').value) || 0,
    hour: parseInt(document.getElementById('evHour').value) || 0,
    chargeAmount: parseFloat(document.getElementById('evChargeAmount').value) || 0
  };
}

function syncProfileToForm(){
  // Tariff
  document.getElementById('tariffMode').value = currentProfile.tariff.mode;
  document.getElementById('tariffConsumption').value = currentProfile.tariff.consumption;
  document.getElementById('tariffInjection').value = currentProfile.tariff.injection;
  document.getElementById('tariffNight').value = currentProfile.tariff.night;
  document.getElementById('nightStart').value = currentProfile.tariff.nightStart;
  document.getElementById('nightEnd').value = currentProfile.tariff.nightEnd;
  toggleTariffMode();

  // PV Groups
  document.getElementById('pvGroupsContainer').innerHTML = '';
  currentProfile.pvGroups.forEach(g => addPvGroup(g));

  // Equipment
  const wm = currentProfile.equipment.washingMachine;
  document.getElementById('wmEnabled').checked = wm.enabled;
  document.getElementById('wmPower').value = wm.power;
  document.getElementById('wmDuration').value = wm.duration;
  document.getElementById('wmHour').value = wm.hour;

  const dw = currentProfile.equipment.dishwasher;
  document.getElementById('dwEnabled').checked = dw.enabled;
  document.getElementById('dwPower').value = dw.power;
  document.getElementById('dwDuration').value = dw.duration;
  document.getElementById('dwHour').value = dw.hour;

  const dry = currentProfile.equipment.dryer;
  document.getElementById('dryEnabled').checked = dry.enabled;
  document.getElementById('dryPower').value = dry.power;
  document.getElementById('dryDuration').value = dry.duration;
  document.getElementById('dryHour').value = dry.hour;

  // AC
  document.getElementById('acContainer').innerHTML = '';
  currentProfile.equipment.ac.forEach(ac => addAcUnit(ac));

  // EV
  const ev = currentProfile.equipment.ev;
  document.getElementById('evEnabled').checked = ev.enabled;
  document.getElementById('evCapacity').value = ev.capacity;
  document.getElementById('evPower').value = ev.power;
  document.getElementById('evHour').value = ev.hour;
  document.getElementById('evChargeAmount').value = ev.chargeAmount;

  refreshP1Table();
  refreshBattTable();

  loadP1Entries();
  loadBatteryOffers();
  refreshP1Table();
  refreshBattTable();
}

// ============================================================
// TARIFF TOGGLE
// ============================================================

function toggleTariffMode(){
  const mode = document.getElementById('tariffMode').value;
  document.getElementById('biHoraireFields').style.display = mode === 'bi' ? 'grid' : 'none';
  const lbl = document.getElementById('lblConsumption');
  if(mode === 'bi'){
    lbl.textContent = 'Prix jour (€/kWh)';
  } else {
    lbl.textContent = 'Prix consommation (€/kWh)';
  }
}

// ============================================================
// PV GROUPS UI
// ============================================================

function addPvGroup(data){
  data = data || { panelPower: 320, panelCount: 4, tilt: 30, azimuth: 180 };
  const container = document.getElementById('pvGroupsContainer');
  const box = document.createElement('div');
  box.className = 'group-box pv-group-box';
  box.innerHTML = `
    <button class="remove" onclick="this.parentElement.remove()">✕</button>
    <div class="grid2">
      <div>
        <label>Puissance unitaire (W)</label>
        <input type="number" class="pv-power" value="${data.panelPower}">
      </div>
      <div>
        <label>Nombre de panneaux</label>
        <input type="number" class="pv-count" value="${data.panelCount}">
      </div>
    </div>
    <div class="grid2">
      <div>
        <label>Inclinaison (°) — 13°=plat, 35-45°=classique</label>
        <input type="number" class="pv-tilt" value="${data.tilt}">
      </div>
      <div>
        <label>Orientation azimuth (°) — 180°=Sud</label>
        <input type="number" class="pv-azimuth" value="${data.azimuth}">
      </div>
    </div>
  `;
  container.appendChild(box);
}

// ============================================================
// AC UNITS UI
// ============================================================

function addAcUnit(data){
  data = data || { name: "Climatisation", power: 1500, hours: [13, 14, 15, 16, 17] };
  const container = document.getElementById('acContainer');
  const box = document.createElement('div');
  box.className = 'group-box ac-box';
  box.innerHTML = `
    <button class="remove" onclick="this.parentElement.remove()">✕</button>
    <label>Nom</label>
    <input type="text" class="ac-name" value="${data.name}">
    <div class="grid2">
      <div>
        <label>Puissance (W)</label>
        <input type="number" class="ac-power" value="${data.power}">
      </div>
      <div>
        <label>Heures actives (séparées par virgules, ex: 13,14,15)</label>
        <input type="text" class="ac-hours" value="${data.hours.join(',')}">
      </div>
    </div>
  `;
  container.appendChild(box);
}

// ============================================================
// P1 ENTRIES MANAGEMENT
// ============================================================

function refreshP1Table(){
  const tbody = document.querySelector('#p1Table tbody');
  tbody.innerHTML = '';
  currentProfile.p1Entries.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    const pvInfo = entry.pvProduction ? entry.pvProduction + ' kWh' : '—';
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.grid}</td>
      <td>${entry.surplus}</td>
      <td>${pvInfo}</td>
      <td><button class="btn danger" style="padding:4px 10px;margin:0;" onclick="removeP1Entry(${idx})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function removeP1Entry(idx){
  currentProfile.p1Entries.splice(idx, 1);
  saveP1Entries();  // AJOUT: sauvegarde automatique
  refreshP1Table();
}


function addP1Entry(){
  const date = document.getElementById('p1Date').value;
  const grid = parseFloat(document.getElementById('p1Grid').value);
  const surplus = parseFloat(document.getElementById('p1Surplus').value);

  if(!date || isNaN(grid) || isNaN(surplus)){
    alert("Merci de compléter date, Grid et Surplus.");
    return;
  }

  const entry = {
    date,
    grid,
    surplus,
    pvProduction: null,
    hourlyImport: window.lastP1Curve ? window.lastP1Curve.hourlyImportKWh : null,
    hourlyExport: window.lastP1Curve ? window.lastP1Curve.hourlyExportKWh : null,
    hourlyProduction: window.lastPVCurve ? window.lastPVCurve.hourlyProductionKWh : null
  };

  currentProfile.p1Entries.push(entry);
  refreshP1Table();

  document.getElementById('p1Grid').value = '';
  document.getElementById('p1Surplus').value = '';
  window.lastP1Curve = null;
  window.lastPVCurve = null;
  document.getElementById('p1Status').textContent = '';
}

function addPVEntry(){
  const date = document.getElementById('pvDate').value;
  const pvTotal = parseFloat(document.getElementById('pvTotal').value);

  if(!date || isNaN(pvTotal)){
    alert("Merci de compléter date et production.");
    return;
  }

  // 1. Cherche par correspondance exacte de date
  let existing = currentProfile.p1Entries.find(e => e.date === date);

  // 2. Si pas trouvé par date exacte, fusionne avec la dernière entrée P1 sans PV (tolérance OCR)
  if(!existing && currentProfile.p1Entries.length > 0){
    existing = currentProfile.p1Entries.find(e => !e.pvProduction) || currentProfile.p1Entries[currentProfile.p1Entries.length - 1];
  }

  if(existing){
    existing.pvProduction = pvTotal;
    existing.hourlyProduction = window.lastPVCurve ? window.lastPVCurve.hourlyProductionKWh : existing.hourlyProduction;
    alert(`Production de ${pvTotal} kWh fusionnée avec succès (Relevé du ${existing.date}) !`);
  } else {
    currentProfile.p1Entries.push({
      date,
      grid: 0,
      surplus: 0,
      pvProduction: pvTotal,
      hourlyImport: null,
      hourlyExport: null,
      hourlyProduction: window.lastPVCurve ? window.lastPVCurve.hourlyProductionKWh : null
    });
    alert("Production ajoutée comme nouvelle entrée.");
  }

  saveP1Entries();
  refreshP1Table();
  document.getElementById('pvTotal').value = '';
  window.lastPVCurve = null;
  document.getElementById('pvStatus').textContent = '';
}


// ============================================================
// BATTERIES MANAGEMENT
// ============================================================

function addBatteryOffer(){
  const name = document.getElementById('battName').value.trim();
  const capacity = parseFloat(document.getElementById('battCapacity').value);
  const power = parseFloat(document.getElementById('battPower').value);
  const cost = parseFloat(document.getElementById('battCost').value);
  const efficiency = parseFloat(document.getElementById('battEfficiency').value) / 100;

  if(!name || isNaN(capacity) || isNaN(cost)){
    alert("Merci de compléter au moins le nom, la capacité et le coût.");
    return;
  }

  currentProfile.batteryOffers.push({ name, capacity, power, cost, efficiency });
  saveBatteryOffers();  // AJOUT: sauvegarde automatique
  refreshBattTable();
  document.getElementById('battName').value = '';
  document.getElementById('battCapacity').value = '10';
  document.getElementById('battPower').value = '5';
  document.getElementById('battCost').value = '8000';
  document.getElementById('battEfficiency').value = '90';
}


function refreshBattTable(){
  const tbody = document.querySelector('#battTable tbody');
  tbody.innerHTML = '';
  currentProfile.batteryOffers.forEach((b, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.capacity} kWh</td>
      <td>${b.power} kW</td>
      <td>${b.cost} €</td>
      <td><button class="btn danger" style="padding:4px 10px;margin:0;" onclick="removeBattOffer(${idx})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function removeBattOffer(idx){
  currentProfile.batteryOffers.splice(idx, 1);
  saveBatteryOffers();  // AJOUT: sauvegarde automatique
  refreshBattTable();
}


// ============================================================
// SIMULATION SELECTS REFRESH
// ============================================================

function refreshSimulationSelects(){
  const p1Sel = document.getElementById('simP1Select');
  p1Sel.innerHTML = '';
  currentProfile.p1Entries.forEach((e, idx) => {
    const opt = document.createElement('option');
    const pvInfo = e.pvProduction ? ` + PV: ${e.pvProduction}kWh` : '';
    opt.value = idx;
    opt.textContent = `${e.date} — Grid: ${e.grid}kWh / Surplus: ${e.surplus}kWh${pvInfo}`;
    p1Sel.appendChild(opt);
  });

  const battSel = document.getElementById('simBattSelect');
  battSel.innerHTML = '';
  currentProfile.batteryOffers.forEach((b, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${b.name} (${b.capacity}kWh - ${b.cost}€)`;
    battSel.appendChild(opt);
  });
}

function addP1Entry(){
  const date = document.getElementById('p1Date').value;
  const grid = parseFloat(document.getElementById('p1Grid').value);
  const surplus = parseFloat(document.getElementById('p1Surplus').value);

  if(!date || isNaN(grid) || isNaN(surplus)){
    alert("Merci de compléter date, Grid et Surplus.");
    return;
  }

  const entry = {
    date,
    grid,
    surplus,
    pvProduction: null,
    hourlyImport: window.lastP1Curve ? window.lastP1Curve.hourlyImportKWh : null,
    hourlyExport: window.lastP1Curve ? window.lastP1Curve.hourlyExportKWh : null,
    hourlyProduction: window.lastPVCurve ? window.lastPVCurve.hourlyProductionKWh : null
  };

  currentProfile.p1Entries.push(entry);
  saveP1Entries();  // AJOUT: sauvegarde automatique
  refreshP1Table();

  document.getElementById('p1Grid').value = '';
  document.getElementById('p1Surplus').value = '';
  window.lastP1Curve = null;
  window.lastPVCurve = null;
  document.getElementById('p1Status').textContent = '';
}

