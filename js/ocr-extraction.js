// ============================================================
// CONVERTISSEUR RGB -> HSL (Ultra-robuste pour la détection de couleurs)
// ============================================================
function rgbToHsl(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if(max === min){
    h = s = 0; // achromatique
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function isPurpleHSL(hsl){
  return hsl.h >= 240 && hsl.h <= 315 && hsl.s > 25 && hsl.l > 15 && hsl.l < 85;
}

function isGreenHSL(hsl){
  return hsl.h >= 95 && hsl.h <= 165 && hsl.s > 25 && hsl.l > 15 && hsl.l < 85;
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
  const fullImageData = ctx.getImageData(0, 0, width, height);
  const data = fullImageData.data;

  // 1. AUTO-CALIBRATION DE LA GRILLE (Cherche les lignes de grille grises horizontales)
  let gridLinesY = [];
  let xStart = Math.floor(width * 0.05);
  let xEnd = Math.floor(width * 0.95);

  const scanYStart = Math.floor(height * 0.45);
  const scanYEnd = Math.floor(height * 0.88);

  for(let y = scanYStart; y < scanYEnd; y++){
    let grayCount = 0;
    let firstGrayX = null;
    let lastGrayX = null;

    for(let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x++){
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      
      // Filtre gris de grille
      if(Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 30 && r < 80){
        grayCount++;
        if(firstGrayX === null) firstGrayX = x;
        lastGrayX = x;
      }
    }
    // Si la ligne contient une longue ligne grise continue, c'est une ligne de grille !
    if(grayCount > (width * 0.5)){
      if(gridLinesY.length === 0 || y - gridLinesY[gridLinesY.length - 1].y > 15){
        gridLinesY.push({ y, xStart: firstGrayX, xEnd: lastGrayX });
      }
    }
  }

  // Fallback si la détection dynamique échoue (aspect-ratio standard)
  let yTop = Math.floor(height * 0.53);
  let yBottom = Math.floor(height * 0.81);

  if(gridLinesY.length >= 2){
    xStart = gridLinesY[0].xStart;
    xEnd = gridLinesY[0].xEnd;
    // Si on trouve les 4 lignes de grille (+2000, 0, -2000, -4000)
    if(gridLinesY.length === 4){
      yTop = gridLinesY[0].y;
      yBottom = gridLinesY[3].y;
    } else {
      yTop = gridLinesY[0].y;
      yBottom = gridLinesY[gridLinesY.length - 1].y;
    }
  }

  const chartWidthPx = xEnd - xStart;
  const chartHeightPx = yBottom - yTop;

  let importSums = new Array(96).fill(0);
  let importCounts = new Array(96).fill(0);
  let exportSums = new Array(96).fill(0);
  let exportCounts = new Array(96).fill(0);

  // 2. SCAN PIXEL PAR PIXEL EN UTILISANT HSL
  for(let x = xStart; x < xEnd; x++){
    const timeIndex = Math.floor(((x - xStart) / chartWidthPx) * 96);
    if(timeIndex < 0 || timeIndex >= 96) continue;

    for(let y = yTop; y < yBottom; y++){
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const hsl = rgbToHsl(r, g, b);

      const ratioY = (y - yTop) / chartHeightPx;
      const powerVal = 2000 - ratioY * 6000; // Échelle de +2000W à -4000W

      if(isPurpleHSL(hsl)){
        if(powerVal > 0){
          importSums[timeIndex] += powerVal;
          importCounts[timeIndex]++;
        }
      }
      if(isGreenHSL(hsl)){
        if(powerVal < 0){
          exportSums[timeIndex] += Math.abs(powerVal);
          exportCounts[timeIndex]++;
        }
      }
    }
  }

  // Conversion en kWh sur l'intervalle de 15 min (W * 0.25h / 1000)
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
  const fullImageData = ctx.getImageData(0, 0, width, height);
  const data = fullImageData.data;

  // Détection des limites du graphique SolarEdge
  const bounds = {
    xStart: Math.floor(width * 0.08),
    xEnd: Math.floor(width * 0.98),
    yTop: Math.floor(height * 0.35),
    yBottom: Math.floor(height * 0.90),
    valueTop: 3.5, // Puissance max en haut de l'échelle (kW)
    valueBottom: 0
  };

  const chartWidthPx = bounds.xEnd - bounds.xStart;
  const chartHeightPx = bounds.yBottom - bounds.yTop;

  let prodSums = new Array(96).fill(0);
  let prodCounts = new Array(96).fill(0);

  for(let x = bounds.xStart; x < bounds.xEnd; x++){
    // Alignement temporel : Le graphique SolarEdge couvre environ de 05h30 à 20h30 (soit 15 heures)
    const ratioX = (x - bounds.xStart) / chartWidthPx;
    const hour = 5.5 + ratioX * 15; // Mappe de 05:30 à 20:30
    const timeIndex = Math.floor(hour * 4); // Convertit en index de 15 minutes (0-95)
    if(timeIndex < 0 || timeIndex >= 96) continue;

    let greenTopY = null;

    for(let y = bounds.yTop; y < bounds.yBottom; y++){
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const hsl = rgbToHsl(r, g, b);

      if(isGreenHSL(hsl)){
        greenTopY = y;
        break; // Premier pixel vert rencontré en partant du haut = haut de la courbe
      }
    }

    if(greenTopY !== null){
      const ratioY = (greenTopY - bounds.yTop) / chartHeightPx;
      const kWValue = bounds.valueTop - ratioY * 3.5;
      prodSums[timeIndex] += Math.max(0, kWValue);
      prodCounts[timeIndex]++;
    }
  }

  // Énergie sur 15 min (kW * 0.25h)
  let hourlyProductionKWh = prodSums.map((sum, i) =>
    prodCounts[i] > 0 ? (sum / prodCounts[i]) * 0.25 : 0
  );

  return { hourlyProductionKWh };
}

// ============================================================
// OCR & DATES (Inchangés mais conservés pour intégrité)
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
