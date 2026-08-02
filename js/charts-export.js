// ============================================================
// ÉTAT GLOBAL & PROFIL PAR DÉFAUT
// ============================================================

let currentProfile = defaultProfile();

function defaultProfile(){
  return {
    name: "",
    tariff: {
      mode: "mono",
      consumption: 0.369,
      night: 0.20,
      nightStart: "22:00",
      nightEnd: "06:00",
      injection: 0.0309
    },
    pvGroups: [
      { panelPower: 320, panelCount: 4, tilt: 13, azimuth: 164 },
      { panelPower: 320, panelCount: 11, tilt: 45, azimuth: 254 }
    ],
    equipment: {
      washingMachine: { enabled: true, power: 2000, duration: 1.5, hour: 14 },
      dishwasher: { enabled: true, power: 1500, duration: 2, hour: 13 },
      dryer: { enabled: false, power: 2500, duration: 1.5, hour: 15 },
      ac: [],
      ev: { enabled: false, capacity: 60, power: 7.4, hour: 22, chargeAmount: 30 }
    },
    p1Entries: [],
    batteryOffers: []
  };
}

// ============================================================
// PROFIL MANAGEMENT (localStorage)
// ============================================================

function getProfilesList(){
  return JSON.parse(localStorage.getItem('battery_sim_profiles') || '{}');
}

function saveProfilesList(profiles){
  localStorage.setItem('battery_sim_profiles', JSON.stringify(profiles));
}

function refreshProfileSelect(){
  const profiles = getProfilesList();
  const sel = document.getElementById('profileSelect');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  Object.keys(profiles).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function saveCurrentProfile(){
  syncFormToProfile();
  const name = document.getElementById('profileName').value.trim();
  if(!name){
    alert("Merci d'indiquer un nom de profil.");
    return;
  }
  currentProfile.name = name;
  const profiles = getProfilesList();
  profiles[name] = JSON.parse(JSON.stringify(currentProfile));
  saveProfilesList(profiles);
  refreshProfileSelect();
  alert("Profil '" + name + "' sauvegardé.");
}

function loadSelectedProfile(){
  const name = document.getElementById('profileSelect').value;
  if(!name) return;
  const profiles = getProfilesList();
  currentProfile = JSON.parse(JSON.stringify(profiles[name]));
  document.getElementById('profileName').value = name;
  syncProfileToForm();
  alert("Profil '" + name + "' chargé.");
}

function deleteSelectedProfile(){
  const name = document.getElementById('profileSelect').value;
  if(!name) return;
  if(!confirm("Supprimer le profil '" + name + "' ?")) return;
  const profiles = getProfilesList();
  delete profiles[name];
  saveProfilesList(profiles);
  refreshProfileSelect();
  alert("Profil supprimé.");
}

function newProfile(){
  currentProfile = defaultProfile();
  document.getElementById('profileName').value = '';
  syncProfileToForm();
}

// ============================================================
// CONSTANTES DE MODÈLE SOLAIRE
// ============================================================

const MONTHLY_KWH_PER_KWC = [25, 45, 80, 110, 130, 135, 130, 115, 90, 60, 30, 20];
const DAYLENGTH_BY_MONTH = [8, 9, 10, 10.5, 11, 11.5, 11.5, 11, 10, 9, 8, 7.5];

// ============================================================
// CONSTANTES OCR & EXTRACTION PIXEL
// ============================================================

const COLOR_PURPLE = { r: 155, g: 60, b: 200, tolerance: 45 };
const COLOR_GREEN_HW = { r: 45, g: 200, b: 130, tolerance: 45 };
const COLOR_GREEN_SE = { r: 40, g: 200, b: 110, tolerance: 45 };

const HOMEWIZARD_CHART_BOUNDS = {
  xStart: 0.05,
  xEnd: 0.95,
  yTop: 0.08,
  yBottom: 0.75,
  valueTop: 2000,
  valueBottom: -4000
};

const SOLAREDGE_CHART_BOUNDS = {
  xStart: 0.08,
  xEnd: 0.98,
  yTop: 0.15,
  yBottom: 0.92,
  valueTop: 3.5,
  valueBottom: 0
};

// ============================================================
// SIGNATURES D'ÉQUIPEMENTS (Pattern Recognition)
// ============================================================

const APPLIANCE_SIGNATURES = {
  washingMachine: {
    name: "Machine à laver",
    powerRange: [1800, 2500],
    durationRange: [60, 150],
    pattern: "plateau_simple",
    description: "Plateau élevé constant (chauffage eau) + oscillations (essorage)"
  },
  dishwasher: {
    name: "Lave-vaisselle",
    powerRange: [1500, 2200],
    durationRange: [90, 200],
    pattern: "double_pic",
    description: "Pic début (chauffage) → creux → pic fin (séchage)"
  },
  dryer: {
    name: "Sèche-linge",
    powerRange: [2000, 2800],
    durationRange: [50, 120],
    pattern: "plateau_debut",
    description: "Plateau élevé en début, puis décroissance progressive"
  },
  oven: {
    name: "Four électrique",
    powerRange: [2000, 3200],
    durationRange: [20, 100],
    pattern: "oscillant",
    description: "Plateau avec oscillations régulières (thermostat)"
  },
  microwave: {
    name: "Micro-ondes",
    powerRange: [800, 1200],
    durationRange: [2, 20],
    pattern: "pic_court",
    description: "Pic court et net"
  }
};

// ============================================================
// HELPER: FORMES DE CONSOMMATION
// ============================================================

function baseLoadShape(){
  return [
    0.3, 0.25, 0.2, 0.2, 0.2, 0.25, 0.4, 0.6,
    0.5, 0.4, 0.4, 0.4, 0.45, 0.4, 0.4, 0.4,
    0.45, 0.6, 0.9, 1.0, 0.9, 0.7, 0.5, 0.35
  ];
}

// ============================================================
// PERSISTENT STORAGE FOR P1 & BATTERY ENTRIES (auto-save)
// ============================================================

function saveP1Entries(){
  localStorage.setItem('battery_sim_p1_entries', JSON.stringify(currentProfile.p1Entries));
}

function loadP1Entries(){
  const saved = localStorage.getItem('battery_sim_p1_entries');
  if(saved){
    try {
      currentProfile.p1Entries = JSON.parse(saved);
    } catch(e){
      console.error('Erreur chargement P1 entries:', e);
    }
  }
}

function saveBatteryOffers(){
  localStorage.setItem('battery_sim_battery_offers', JSON.stringify(currentProfile.batteryOffers));
}

function loadBatteryOffers(){
  const saved = localStorage.getItem('battery_sim_battery_offers');
  if(saved){
    try {
      currentProfile.batteryOffers = JSON.parse(saved);
    } catch(e){
      console.error('Erreur chargement battery offers:', e);
    }
  }
}

function clearP1Entries(){
  if(confirm("Voulez-vous vraiment vider tous les relevés P1 enregistrés ?")){
    currentProfile.p1Entries = [];
    saveP1Entries();
    refreshP1Table();
  }
}

function clearBatteryOffers(){
  if(confirm("Voulez-vous vraiment supprimer toutes les offres batteries ?")){
    currentProfile.batteryOffers = [];
    saveBatteryOffers();
    refreshBattTable();
  }
}

// ============================================================
// HELPER: CACHE POUR P1 & PV
// ============================================================

window.lastP1Curve = null;
window.lastPVCurve = null;
window.detectedAppliances = [];
