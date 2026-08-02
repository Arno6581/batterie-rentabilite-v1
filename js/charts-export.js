// Instances globales pour éviter les conflits au re-rendu
let chartRawInstance = null;
let chartConsInstance = null;
let chartSimInstance = null;
let chartSocInstance = null;

const chartHours = Array.from({length: 24}, (_, h) => h + 'h');

// Options communes pour un design sombre et propre (Responsive & non bloqué par l'aspectRatio)
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
    y: { ticks: { color: '#9ca3af' }, grid: { color: '#2d3142' } }
  }
};

// ============================================================
// 1. CHART RAW : MESURES BRUTES (P1 & PV)
// ============================================================
function renderRawChart(res) {
  const ctx = document.getElementById('chartRaw').getContext('2d');
  if (chartRawInstance) chartRawInstance.destroy();

  const rawImport = res.entry.hourlyImport || res.withBatt.hourly.map(h => h.gridImport);
  const rawExport = res.entry.hourlyExport || res.withBatt.hourly.map(h => h.gridExport);

  chartRawInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartHours,
      datasets: [
        {
          label: 'Production PV réelle (kWh)',
          data: res.productionCurve,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Import Réseau P1 (kWh)',
          data: rawImport,
          borderColor: '#9d4edd',
          backgroundColor: 'rgba(157,78,221,0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Injection Réseau P1 (kWh)',
          data: rawExport,
          borderColor: '#2ec4b6',
          backgroundColor: 'rgba(46,196,182,0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 2. CHART CONS : PROFILE DE CONSOMMATION HABITATION
// ============================================================
function renderConsChart(res) {
  const ctx = document.getElementById('chartCons').getContext('2d');
  if (chartConsInstance) chartConsInstance.destroy();

  chartConsInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartHours,
      datasets: [{
        label: 'Consommation Totale Maison (kWh)',
        data: res.consumptionCurve,
        borderColor: '#f87171',
        backgroundColor: 'rgba(248,113,113,0.15)',
        fill: true,
        tension: 0.3
      }]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 3. CHART SIM : IMPACT DE LA BATTERIE SUR LES FLUX
// ============================================================
function renderSimChart(res) {
  const ctx = document.getElementById('chartSim').getContext('2d');
  if (chartSimInstance) chartSimInstance.destroy();

  chartSimInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartHours,
      datasets: [
        {
          label: 'Consommation Initiale (kWh)',
          data: res.consumptionCurve,
          borderColor: '#f87171',
          borderDash: [5, 5],
          fill: false,
          tension: 0.3
        },
        {
          label: 'Nouvel Import Réseau avec Batterie (kWh)',
          data: res.withBatt.hourly.map(h => h.gridImport),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.2)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: commonChartOptions
  });
}

// ============================================================
// 4. CHART SOC : NIVEAU DE CHARGE BATTERIE (SoC)
// ============================================================
function renderSocChart(res) {
  const ctx = document.getElementById('chartSoc').getContext('2d');
  if (chartSocInstance) chartSocInstance.destroy();

  const battCapacity = currentProfile.batteryOffers[
    document.getElementById('simBattSelect').value
  ]?.capacity || 10;

  chartSocInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartHours,
      datasets: [{
        label: 'Niveau de charge (kWh)',
        data: res.withBatt.socHistory,
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }]
    },
    options: {
      ...commonChartOptions,
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#2d3142' } },
        y: {
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
  if (chartRawInstance) {
    doc.text("1. Flux d'origine mesurés :", 20, y);
    doc.addImage(document.getElementById('chartRaw').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
    y += 75;
  }

  doc.addPage();
  y = 20;

  if (chartConsInstance) {
    doc.text("2. Profil de consommation estimé :", 20, y);
    doc.addImage(document.getElementById('chartCons').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
    y += 75;
  }

  if (chartSimInstance) {
    doc.text("3. Impact de la batterie sur l'import réseau :", 20, y);
    doc.addImage(document.getElementById('chartSim').toDataURL('image/png'), 'PNG', 20, y + 3, 170, 65);
  }

  doc.save(`rapport_batterie_${profileName.replace(/\s+/g, '_')}.pdf`);
}
