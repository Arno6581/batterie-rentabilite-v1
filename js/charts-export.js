window.chartRawInstance = window.chartRawInstance || null;
window.chartConsInstance = window.chartConsInstance || null;
window.chartSimInstance = window.chartSimInstance || null;
window.chartSocInstance = window.chartSocInstance || null;

const chartLabels = Array.from({length: 96}, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return m === 0 ? h + 'h' : '';
});

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#e5e7eb', font: { size: 11 } }
    }
  },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: '#2d3142' } },
    y: { 
      title: { display: true, text: 'Puissance (kW)', color: '#9ca3af' }, // Correction Unité: kW
      ticks: { color: '#9ca3af' }, 
      grid: { color: '#2d3142' } 
    }
  }
};

// ============================================================
// 1. CHART RAW : MESURES BRUTES (P1 & PV en kW)
// ============================================================
function renderRawChart(res) {
  const ctx = document.getElementById('chartRaw').getContext('2d');
  if (window.chartRawInstance) window.chartRawInstance.destroy();

  const rawImport = res.entry.hourlyImport || res.withBatt.hourly.map(h => h.gridImport);
  const rawExport = res.entry.hourlyExport || res.withBatt.hourly.map(h => h.gridExport);

  // Conversion Énergie 15min (kWh) -> Puissance (kW) : multiplication par 4
  const pvPower = res.productionCurve.map(v => v * 4);
  const importPower = rawImport.map(v => v * 4);
  const exportPower = rawExport.map(v => v * 4);

  window.chartRawInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Production PV (kW)',
          data: pvPower,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'Import Réseau P1 (kW)',
          data: importPower,
          borderColor: '#9d4edd',
          backgroundColor: 'rgba(157,78,221,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'Injection Réseau P1 (kW)',
          data: exportPower,
          borderColor: '#2ec4b6',
          backgroundColor: 'rgba(46,196,182,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
        }
      ]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 2. CHART CONS : PROFILE DE CONSOMMATION HABITATION (kW)
// ============================================================
function renderConsChart(res) {
  const ctx = document.getElementById('chartCons').getContext('2d');
  if (window.chartConsInstance) window.chartConsInstance.destroy();

  const consPower = res.consumptionCurve.map(v => v * 4);

  window.chartConsInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Consommation Totale Maison (kW)',
        data: consPower,
        borderColor: '#f87171',
        backgroundColor: 'rgba(248,113,113,0.15)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 3. CHART SIM : IMPACT DE LA BATTERIE SUR LES FLUX (kW)
// ============================================================
function renderSimChart(res) {
  const ctx = document.getElementById('chartSim').getContext('2d');
  if (window.chartSimInstance) window.chartSimInstance.destroy();

  const consPower = res.consumptionCurve.map(v => v * 4);
  const importWithBatteryPower = res.withBatt.hourly.map(h => h.gridImport * 4);

  window.chartSimInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Consommation Initiale (kW)',
          data: consPower,
          borderColor: '#f87171',
          borderDash: [5, 5],
          fill: false,
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'Nouvel Import Réseau avec Batterie (kW)',
          data: importWithBatteryPower,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.2)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
        }
      ]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 4. CHART SOC : NIVEAU DE CHARGE BATTERIE (SoC - kWh)
// ============================================================
function renderSocChart(res) {
  const ctx = document.getElementById('chartSoc').getContext('2d');
  if (window.chartSocInstance) window.chartSocInstance.destroy();

  const battCapacity = currentProfile.batteryOffers[
    document.getElementById('simBattSelect').value
  ]?.capacity || 10;

  window.chartSocInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Niveau de charge (kWh)', // Reste en kWh (Capacité d'énergie de la batterie)
        data: res.withBatt.socHistory,
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.15)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      ...commonChartOptions,
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#2d3142' } },
        y: {
          title: { display: true, text: 'Niveau d\'énergie (kWh)', color: '#9ca3af' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#2d3142' },
          min: 0,
          max: battCapacity * 1.05
        }
      }
    }
  });
}

// ============================================================
// EXPORT PDF
// ============================================================
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const profileName = currentProfile.name || "Sans nom";
  const today = new Date().toLocaleDateString('fr-BE');

  doc.setFontSize(16);
  doc.text("📊 Rapport Simulation Batterie Domestique v1.1", 20, 20);

  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Profil: ${profileName} | Date: ${today}`, 20, 28);

  let y = 40;
  doc.setFontSize(11);
  doc.setTextColor(50, 50, 50);

  const results = [
    ["Import réseau SANS batterie", document.getElementById('resGridWithout').textContent + " kWh"],
    ["Import réseau AVEC batterie", document.getElementById('resGridWith').textContent + " kWh"],
    ["Économie journalière", document.getElementById('resDailySavings').textContent],
    ["Économie annuelle estimée", document.getElementById('resAnnualSavings').textContent],
    ["Retour sur investissement", document.getElementById('resPayback').textContent]
  ];

  results.forEach(([label, value]) => {
    doc.text(`${label} : ${value}`, 20, y);
    y += 7;
  });

  y += 5;
  if (window.chartRawInstance) {
    doc.text("1. Flux d'origine mesurés :", 20, y);
    doc.addImage(document.getElementById('chartRaw').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
    y += 75;
  }

  doc.addPage();
  y = 20;

  if (window.chartConsInstance) {
    doc.text("2. Profil de consommation estimé :", 20, y);
    doc.addImage(document.getElementById('chartCons').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
    y += 75;
  }

  if (window.chartSimInstance) {
    doc.text("3. Impact de la batterie sur l'import réseau :", 20, y);
    doc.addImage(document.getElementById('chartSim').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
  }

  doc.save(`rapport_batterie_${profileName.replace(/\s+/g, '_')}.pdf`);
}
