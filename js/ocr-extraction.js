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
// EXTRACT HOMEWIZARD CURVE (P1 Import/Export en W)
// ============================================================

async function extractHomeWizardCurve(canvasData){
  const { ctx, width, height } = canvasData;
  const bounds = HOMEWIZARD_CHART_BOUNDS;

  const xPixelStart = Math.floor(width * bounds.xStart);
  const xPixelEnd = Math.floor(width * bounds.xEnd);
  const yPixelTop = Math.floor(height * bounds.yTop);
  const yPixelBottom = Math.floor(height * bounds.yBottom);

  const chartWidthPx = xPixelEnd - xPixelStart;
  const chartHeightPx = yPixelBottom - yPixelTop;

  let hourlyImportW = new Array(24).fill(0);
  let hourlyExportW = new Array(24).fill(0);
  let hourlySamples = new Array(24).fill(0);

  const imageData = ctx.getImageData(xPixelStart, yPixelTop, chartWidthPx, chartHeightPx);
  const data = imageData.data;

  for(let x = 0; x < chartWidthPx; x++){
    const hourIndex = Math.floor((x / chartWidthPx) * 24);
    if(hourIndex < 0 || hourIndex >= 24) continue;

    let purpleY = null;
    let greenY = null;

    for(let y = 0; y < chartHeightPx; y++){
      const idx = (y * chartWidthPx + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if(colorMatch(r, g, b, COLOR_PURPLE) && purpleY === null){
        purpleY = y;
      }
      if(colorMatch(r, g, b, COLOR_GREEN_HW) && greenY === null){
        greenY = y;
      }
    }

    // Convertir position Y en valeur (W)
    const yToValue = (yPos) => {
      const ratio = yPos / chartHeightPx;
      return bounds.valueTop + ratio * (bounds.valueBottom - bounds.valueTop);
    };

    if(purpleY !== null){
      const val = yToValue(purpleY);
      if(val > 0){
        hourlyImportW[hourIndex] += val;
        hourlySamples[hourIndex]++;
      }
    }

    if(greenY !== null){
      const val = yToValue(greenY);
      if(val < 0){
        hourlyExportW[hourIndex] += Math.abs(val);
        hourlySamples[hourIndex]++;
      }
    }
  }

  // Moyenne et conversion W -> kWh
  let hourlyImportKWh = hourlyImportW.map((v, i) =>
    hourlySamples[i] > 0 ? (v / hourlySamples[i]) / 1000 : 0
  );
  let hourlyExportKWh = hourlyExportW.map((v, i) =>
    hourlySamples[i] > 0 ? (v / hourlySamples[i]) / 1000 : 0
  );

  return { hourlyImportKWh, hourlyExportKWh };
}

// ============================================================
// EXTRACT SOLAREDGE CURVE (Production en kW)
// ============================================================

async function extractSolarEdgeCurve(canvasData){
  const { ctx, width, height } = canvasData;
  const bounds = SOLAREDGE_CHART_BOUNDS;

  const xPixelStart = Math.floor(width * bounds.xStart);
  const xPixelEnd = Math.floor(width * bounds.xEnd);
  const yPixelTop = Math.floor(height * bounds.yTop);
  const yPixelBottom = Math.floor(height * bounds.yBottom);

  const chartWidthPx = xPixelEnd - xPixelStart;
  const chartHeightPx = yPixelBottom - yPixelTop;

  let hourlyProductionKW = new Array(24).fill(0);
  let hourlySamples = new Array(24).fill(0);

  const imageData = ctx.getImageData(xPixelStart, yPixelTop, chartWidthPx, chartHeightPx);
  const data = imageData.data;

  for(let x = 0; x < chartWidthPx; x++){
    const hourIndex = Math.floor((x / chartWidthPx) * 24);
    if(hourIndex < 0 || hourIndex >= 24) continue;

    let greenTopY = null;

    for(let y = 0; y < chartHeightPx; y++){
      const idx = (y * chartWidthPx + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if(colorMatch(r, g, b, COLOR_GREEN_SE)){
        greenTopY = y;
        break;
      }
    }

    if(greenTopY !== null){
      const ratio = greenTopY / chartHeightPx;
      const value = bounds.valueTop - ratio * (bounds.valueTop - bounds.valueBottom);
      hourlyProductionKW[hourIndex] += Math.max(0, value);
      hourlySamples[hourIndex]++;
    }
  }

  let hourlyProductionKWh = hourlyProductionKW.map((v, i) =>
    hourlySamples[i] > 0 ? v / hourlySamples[i] : 0
  );

  return { hourlyProductionKWh };
}

// ============================================================
// OCR VIA TESSERACT
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
// EXTRACT HOMEWIZARD VALUES FROM TEXT
// ============================================================

function extractHomeWizardValues(text){
  // Cherche Grid et Surplus avec meilleure précision
  const gridMatch = text.match(/Grid[\s\S]{0,15}?(\d+[.,]\d+)/i);
  const surplusMatch = text.match(/Surplus[\s\S]{0,15}?(\d+[.,]\d+)/i);

  let grid = gridMatch ? parseFloat(gridMatch[1].replace(',', '.')) : null;
  let surplus = surplusMatch ? parseFloat(surplusMatch[1].replace(',', '.')) : null;

  return { grid, surplus };
}

// ============================================================
// EXTRACT SOLAREDGE PRODUCTION FROM TEXT
// ============================================================

function extractSolarEdgeProduction(text){
  const match = text.match(/Production[\s\S]{0,20}?(\d+[.,]\d+)\s*kWh/i);
  if(match){
    return parseFloat(match[1].replace(',', '.'));
  }

  // Fallback: cherche juste un nombre suivi de kWh
  const fallback = text.match(/(\d+[.,]\d+)\s*kWh/i);
  return fallback ? parseFloat(fallback[1].replace(',', '.')) : null;
}

// ============================================================
// EXTRACT DATE FROM TEXT
// ============================================================

function extractDateFromText(text){
  const today = new Date();

  // Check "Yesterday"
  if(/yesterday/i.test(text)){
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  // Format anglais "Fri 31 Jul"
  const monthsEn = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const enMatch = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  if(enMatch){
    const day = parseInt(enMatch[1]);
    const month = monthsEn[enMatch[2].toLowerCase()];
    const year = today.getFullYear();
    return new Date(year, month, day).toISOString().split('T')[0];
  }

  // Format français "ven. 31/07/2026"
  const frMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(frMatch){
    const day = parseInt(frMatch[1]);
    const month = parseInt(frMatch[2]) - 1;
    let year = parseInt(frMatch[3]);
    if(year < 100) year += 2000;
    return new Date(year, month, day).toISOString().split('T')[0];
  }

  return today.toISOString().split('T')[0];
}

// ============================================================
// HANDLE P1 IMAGE UPLOAD
// ============================================================

async function handleP1Image(event){
  const file = event.target.files[0];
  if(!file) return;

  document.getElementById('p1Status').textContent = "⏳ Analyse OCR + extraction courbe en cours...";

  try {
    // OCR
    const text = await runOCR(file);
    const { grid, surplus } = extractHomeWizardValues(text);
    const date = extractDateFromText(text);

    // Remplir les champs
    if(grid !== null) document.getElementById('p1Grid').value = grid;
    if(surplus !== null) document.getElementById('p1Surplus').value = surplus;
    document.getElementById('p1Date').value = date;

    // Extraction pixel
    const canvasData = await loadImageToCanvas(file);
    const curve = await extractHomeWizardCurve(canvasData);
    window.lastP1Curve = curve;

    document.getElementById('p1Status').innerHTML =
      `<span style="color:var(--accent);">✓ OCR terminé — Grid: ${grid ?? '?'} kWh, Surplus: ${surplus ?? '?'} kWh, Date: ${date}</span>`;

  } catch(e){
    document.getElementById('p1Status').innerHTML =
      `<span style="color:var(--danger);">❌ Erreur : ${e.message}. Saisie manuelle requise.</span>`;
  }
}

// ============================================================
// HANDLE PV IMAGE UPLOAD
// ============================================================

async function handlePVImage(event){
  const file = event.target.files[0];
  if(!file) return;

  document.getElementById('pvStatus').textContent = "⏳ Analyse OCR + extraction courbe en cours...";

  try {
    // OCR
    const text = await runOCR(file);
    const production = extractSolarEdgeProduction(text);
    const date = extractDateFromText(text);

    // Remplir les champs
    if(production !== null) document.getElementById('pvTotal').value = production;
    document.getElementById('pvDate').value = date;

    // Extraction pixel
    const canvasData = await loadImageToCanvas(file);
    const curve = await extractSolarEdgeCurve(canvasData);
    window.lastPVCurve = curve;

    // Recalibre la courbe pour que la somme = production totale
    if(production !== null){
      const sumExtracted = curve.hourlyProductionKWh.reduce((a, b) => a + b, 0);
      if(sumExtracted > 0){
        const factor = production / sumExtracted;
        curve.hourlyProductionKWh = curve.hourlyProductionKWh.map(v => v * factor);
      }
    }

    document.getElementById('pvStatus').innerHTML =
      `<span style="color:var(--accent);">✓ OCR terminé — Production: ${production ?? '?'} kWh, Date: ${date}</span>`;

  } catch(e){
    document.getElementById('pvStatus').innerHTML =
      `<span style="color:var(--danger);">❌ Erreur : ${e.message}. Saisie manuelle requise.</span>`;
  }
}
