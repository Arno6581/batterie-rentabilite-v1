// ============================================================
// COLOR MATCHING UTILITY
// ============================================================

function colorMatch(r, g, b, target){
  return Math.abs(r - target.r) < target.tolerance &&
         Math.abs(g - target.g) < target.tolerance &&
         Math.abs(b - target.b) < target.tolerance;
}

// ============================================================
// CANVAS LOADING
// ============================================================

function loadImageToCanvas(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ canvas, ctx, width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// EXTRACT HOMEWIZARD CURVE (P1 Import/Export en W - 96 points)
// ============================================================

async function extractHomeWizardCurve(canvasData){
  const { ctx, width, height } = canvasData;
  
  // Correction des coordonnées de scan vertical (cible le graphique noir du bas)
  const bounds = {
    xStart: 0.05, xEnd: 0.95,
    yTop: 0.52, yBottom: 0.81, // Vise précisément le graphique dans le bas du screenshot
    valueTop: 2000,
    valueBottom: -4000
  };

  const xPixelStart = Math.floor(width * bounds.xStart);
  const xPixelEnd = Math.floor(width * bounds.xEnd);
  const yPixelTop = Math.floor(height * bounds.yTop);
  const yPixelBottom = Math.floor(height * bounds.yBottom);

  const chartWidthPx = xPixelEnd - xPixelStart;
  const chartHeightPx = yPixelBottom - yPixelTop;

  let importSums = new Array(96).fill(0);
  let importCounts = new Array(96).fill(0);
  let exportSums = new Array(96).fill(0);
  let exportCounts = new Array(96).fill(0);

  const imageData = ctx.getImageData(xPixelStart, yPixelTop, chartWidthPx, chartHeightPx);
  const data = imageData.data;

  for(let x = 0; x < chartWidthPx; x++){
    const timeIndex = Math.floor((x / chartWidthPx) * 96);
    if(timeIndex < 0 || timeIndex >= 96) continue;

    let purpleY = null;
    let greenY = null;

    for(let y = 0; y < chartHeightPx; y++){
      const idx = (y * chartWidthPx + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Détecteurs de couleur robustes (anti-compression)
      if(r > 110 && b > 160 && g < 120 && purpleY === null){
        purpleY = y;
      }
      if(g > 150 && r < 100 && b < 160 && greenY === null){
        greenY = y;
      }
    }

    const yToValue = (yPos) => {
      const ratio = yPos / chartHeightPx;
      return bounds.valueTop + ratio * (bounds.valueBottom - bounds.valueTop);
    };

    if(purpleY !== null){
      const val = yToValue(purpleY);
      if(val > 0){
        importSums[timeIndex] += val;
        importCounts[timeIndex]++;
      }
    }

    if(greenY !== null){
      const val = yToValue(greenY);
      if(val < 0){
        exportSums[timeIndex] += Math.abs(val);
        exportCounts[timeIndex]++;
      }
    }
  }

  // Conversion en kWh pour l'intervalle de 15 minutes (Puissance moyenne * 0.25h / 1000)
  let hourlyImportKWh = importSums.map((sum, i) =>
    importCounts[i] > 0 ? (sum / importCounts[i]) * 0.25 / 1000 : 0
  );
  let hourlyExportKWh = exportSums.map((sum, i) =>
    exportCounts[i] > 0 ? (sum / exportCounts[i]) * 0.25 / 1000 : 0
  );

  return { hourlyImportKWh, hourlyExportKWh };
}

// ============================================================
// EXTRACT SOLAREDGE CURVE (Production en kW - 96 points)
// ============================================================

async function extractSolarEdgeCurve(canvasData){
  const { ctx, width, height } = canvasData;
  
  // Zone ajustée pour une capture d'écran recadrée
  const bounds = {
    xStart: 0.08, xEnd: 0.98,
    yTop: 0.35, yBottom: 0.90,
    valueTop: 3.5,
    valueBottom: 0
  };

  const xPixelStart = Math.floor(width * bounds.xStart);
  const xPixelEnd = Math.floor(width * bounds.xEnd);
  const yPixelTop = Math.floor(height * bounds.yTop);
  const yPixelBottom = Math.floor(height * bounds.yBottom);

  const chartWidthPx = xPixelEnd - xPixelStart;
  const chartHeightPx = yPixelBottom - yPixelTop;

  let prodSums = new Array(96).fill(0);
  let prodCounts = new Array(96).fill(0);

  const imageData = ctx.getImageData(xPixelStart, yPixelTop, chartWidthPx, chartHeightPx);
  const data = imageData.data;

  for(let x = 0; x < chartWidthPx; x++){
    // Alignement temporel : Le graphique SolarEdge s'étend environ de 05h30 à 20h30 (15h de large)
    const ratio = x / chartWidthPx;
    const hour = 5.5 + ratio * (20.5 - 5.5);
    const timeIndex = Math.floor(hour * 4);
    if(timeIndex < 0 || timeIndex >= 96) continue;

    let greenTopY = null;

    for(let y = 0; y < chartHeightPx; y++){
      const idx = (y * chartWidthPx + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if(g > 150 && r < 120 && b < 160){
        greenTopY = y;
        break;
      }
    }

    if(greenTopY !== null){
      const ratioY = greenTopY / chartHeightPx;
      const value = bounds.valueTop - ratioY * (bounds.valueTop - bounds.valueBottom);
      prodSums[timeIndex] += Math.max(0, value);
      prodCounts[timeIndex]++;
    }
  }

  // Énergie produite sur l'intervalle de 15 min (Puissance kW * 0.25h)
  let hourlyProductionKWh = prodSums.map((sum, i) =>
    prodCounts[i] > 0 ? (sum / prodCounts[i]) * 0.25 : 0
  );

  return { hourlyProductionKWh };
}

// ============================================================
// OCR EXECUTION
// ============================================================

async function runOCR(file){
  try {
    const result = await Tesseract.recognize(file, 'eng+fra');
    return result.data.text;
  } catch(e){
    console.error("OCR error:", e);
    throw new Error("Erreur OCR: " + e.message);
  }
}

// ============================================================
// ROBUST HOMEWIZARD EXTRACTOR (GRID vs SURPLUS)
// ============================================================

function extractHomeWizardValues(text){
  const clean = text.toLowerCase().replace(/\s+/g, ' ');
  let grid = null;
  let surplus = null;

  const gridIdx = clean.indexOf('grid');
  const surplusIdx = clean.indexOf('surplus');

  const kwhNumbers = [];
  const kwhRegex = /(\d+[.,]\d+)\s*kwh/g;
  let match;
  while ((match = kwhRegex.exec(clean)) !== null) {
    kwhNumbers.push({
      val: parseFloat(match[1].replace(',', '.')),
      index: match.index
    });
  }

  if (kwhNumbers.length >= 2) {
    if (gridIdx !== -1 && surplusIdx !== -1) {
      if (gridIdx < surplusIdx) {
        grid = kwhNumbers[0].val;
        surplus = kwhNumbers[kwhNumbers.length - 1].val;
      } else {
        grid = kwhNumbers[kwhNumbers.length - 1].val;
        surplus = kwhNumbers[0].val;
      }
    } else {
      grid = kwhNumbers[0].val;
      surplus = kwhNumbers[1].val;
    }
  } else {
    const gMatch = clean.match(/grid\s*[:\-]?\s*(\d+[.,]\d+)/i);
    const sMatch = clean.match(/surplus\s*[:\-]?\s*(\d+[.,]\d+)/i);
    if(gMatch) grid = parseFloat(gMatch[1].replace(',', '.'));
    if(sMatch) surplus = parseFloat(sMatch[1].replace(',', '.'));
  }

  return { grid, surplus };
}

function extractSolarEdgeProduction(text){
  const match = text.match(/Production[\s\S]{0,25}?(\d+[.,]\d+)\s*kWh/i);
  if(match) return parseFloat(match[1].replace(',', '.'));
  const fallback = text.match(/(\d+[.,]\d+)\s*kWh/i);
  return fallback ? parseFloat(fallback[1].replace(',', '.')) : null;
}

// ============================================================
// ULTRA-ROBUST DATE EXTRACTOR
// ============================================================

function extractDateFromText(text){
  const today = new Date();
  const clean = text.toLowerCase();

  if(clean.includes('yesterday') || clean.includes('hier')){
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  const numericDate = clean.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})?/);
  if(numericDate){
    const day = parseInt(numericDate[1]);
    const month = parseInt(numericDate[2]) - 1;
    let year = numericDate[3] ? parseInt(numericDate[3]) : today.getFullYear();
    if(year < 100) year += 2000;
    if(month >= 0 && month < 12 && day > 0 && day <= 31){
      return new Date(year, month, day).toISOString().split('T')[0];
    }
  }

  const months = {
    jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
    janv:0, févr:1, mars:2, avr:3, mai:4, juin:5, juil:6, août:7, sept:8, octo:9, nov:10, déc:11,
    january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11,
    janvier:0, février:1, mars:2, avril:3, mai:4, juin:5, juillet:6, août:7, septembre:8, octobre:9, novembre:10, décembre:11
  };

  const words = clean.replace(/[^\w\s]/gi, ' ').split(/\s+/);
  for(let i = 0; i < words.length - 1; i++){
    let day = parseInt(words[i]);
    let monthWord = words[i+1].substring(0, 4);
    if(!isNaN(day) && day > 0 && day <= 31 && months[monthWord] !== undefined){
      const month = months[monthWord];
      const year = today.getFullYear();
      return new Date(year, month, day).toISOString().split('T')[0];
    }
  }

  return today.toISOString().split('T')[0];
}

// ============================================================
// IMAGE UPLOAD HANDLERS
// ============================================================

async function handleP1Image(event){
  const file = event.target.files[0];
  if(!file) return;

  document.getElementById('p1Status').innerHTML = "⏳ Analyse OCR en cours (Tesseract)...";

  try {
    const text = await runOCR(file);
    const { grid, surplus } = extractHomeWizardValues(text);
    const date = extractDateFromText(text);

    if(grid !== null) document.getElementById('p1Grid').value = grid;
    if(surplus !== null) document.getElementById('p1Surplus').value = surplus;
    document.getElementById('p1Date').value = date;

    const canvasData = await loadImageToCanvas(file);
    const curve = await extractHomeWizardCurve(canvasData);
    window.lastP1Curve = curve;

    document.getElementById('p1Status').innerHTML =
      `<span style="color:var(--accent);">✓ OCR réussi — Grid: ${grid ?? '?'} kWh, Surplus: ${surplus ?? '?'} kWh, Date: ${date}</span>`;

  } catch(e){
    document.getElementById('p1Status').innerHTML =
      `<span style="color:var(--danger);">❌ Erreur : ${e.message}. Saisie manuelle possible.</span>`;
  }
}

async function handlePVImage(event){
  const file = event.target.files[0];
  if(!file) return;

  document.getElementById('pvStatus').innerHTML = "⏳ Analyse OCR en cours (Tesseract)...";

  try {
    const text = await runOCR(file);
    const production = extractSolarEdgeProduction(text);
    const date = extractDateFromText(text);

    if(production !== null) document.getElementById('pvTotal').value = production;
    document.getElementById('pvDate').value = date;

    const canvasData = await loadImageToCanvas(file);
    const curve = await extractSolarEdgeCurve(canvasData);
    window.lastPVCurve = curve;

    if(production !== null){
      const sumExtracted = curve.hourlyProductionKWh.reduce((a, b) => a + b, 0);
      if(sumExtracted > 0){
        const factor = production / sumExtracted;
        curve.hourlyProductionKWh = curve.hourlyProductionKWh.map(v => v * factor);
      }
    }

    document.getElementById('pvStatus').innerHTML =
      `<span style="color:var(--accent);">✓ OCR réussi — Production: ${production ?? '?'} kWh, Date: ${date}</span>`;

  } catch(e){
    document.getElementById('pvStatus').innerHTML =
      `<span style="color:var(--danger);">❌ Erreur : ${e.message}. Saisie manuelle possible.</span>`;
  }
}
