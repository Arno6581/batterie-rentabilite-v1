// ============================================================
// RENDER DAY CHART (Production, Consumption, Import with battery)
// ============================================================

function renderDayChart(res){
  const ctx = document.getElementById('chartDay').getContext('2d');
  if(chartDayInstance) chartDayInstance.destroy();

  const hours = Array.from({length: 24}, (_, h) => h + 'h');

  chartDayInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [
        {
          label: 'Production PV (kWh)',
          data: res.productionCurve,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Consommation (kWh)',
          data: res.consumptionCurve,
          borderColor: '#f87171',
          backgroundColor: 'rgba(248,113,113,0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Import réseau AVEC batterie (kWh)',
          data: res.withBatt.hourly.map(h => h.gridImport),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: '#e5e7eb',
            font: { size: 12 }
          }
        },
        title: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af' },
          grid: { color: '#2d3142' }
        },
        y: {
          title: { display: true, text: 'Puissance (kWh)', color: '#9ca3af' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#2d3142' }
        }
      }
    }
  });
}

// ============================================================
// RENDER SOC CHART (Battery State of Charge)
// ============================================================

function renderSocChart(res){
  const ctx = document.getElementById('chartSoc').getContext('2d');
  if(chartSocInstance) chartSocInstance.destroy();

  const hours = Array.from({length: 24}, (_, h) => h + 'h');
  const battCapacity = currentProfile.batteryOffers[
    document.getElementById('simBattSelect').value
  ]?.capacity || 10;

  chartSocInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [{
        label: 'État de charge batterie (kWh)',
        data: res.withBatt.socHistory,
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#4ade80'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: '#e5e7eb',
            font: { size: 12 }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af' },
          grid: { color: '#2d3142' }
        },
        y: {
          title: { display: true, text: 'Capacité (kWh)', color: '#9ca3af' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#2d3142' },
          min: 0,
          max: battCapacity * 1.1
        }
      }
    }
  });
}

// ============================================================
// PDF EXPORT
// ============================================================

function exportPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const profileName = currentProfile.name || "Sans nom";
  const today = new Date().toLocaleDateString('fr-BE');

  // Title
  doc.setFontSize(16);
  doc.text("📊 Rapport Simulation Batterie Domestique", 20, 20);

  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text(`Profil: ${profileName}`, 20, 30);
  doc.text(`Date d'export: ${today}`, 20, 36);

  // Results
  let y = 50;
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(12);
  doc.text("Résultats de la simulation:", 20, y);
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);

  const results = [
    ["Import réseau SANS batterie", document.getElementById('resGridWithout').textContent],
    ["Import réseau AVEC batterie", document.getElementById('resGridWith').textContent],
    ["Économie journalière", document.getElementById('resDailySavings').textContent],
    ["Économie annuelle estimée", document.getElementById('resAnnualSavings').textContent],
    ["Retour sur investissement", document.getElementById('resPayback').textContent]
  ];

  results.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, 20, y);
    y += 8;
  });

  // Chart 1: Day curve
  y += 10;
  if(chartDayInstance){
    const imgData = document.getElementById('chartDay').toDataURL('image/png');
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text("Courbe journalière (Production, Consommation, Import)", 20, y);
    y += 5;
    doc.addImage(imgData, 'PNG', 20, y, 170, 80);
    y += 90;
  }

  // New page if needed
  if(y > 240 && chartSocInstance){
    doc.addPage();
    y = 20;
  }

  // Chart 2: SOC
  if(chartSocInstance){
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text("État de charge de la batterie (24h)", 20, y);
    y += 5;
    const imgData2 = document.getElementById('chartSoc').toDataURL('image/png');
    doc.addImage(imgData2, 'PNG', 20, y, 170, 80);
  }

  // Save
  const filename = `rapport_batterie_${profileName.replace(/\s+/g, '_')}_${today}.pdf`;
  doc.save(filename);
}

// ============================================================
// HELPER: Format number with locale
// ============================================================

function formatNumber(num, decimals = 2){
  return num.toLocaleString('fr-BE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
