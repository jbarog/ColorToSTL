import { loadImageData, quantize } from './src/quantizer.js';
import { centroidToHex, isLight, pixelCounts, renderLayerCanvas, renderCompositeCanvas } from './src/layers.js';
import { generateLayerSTL, generateFrameSTL } from './src/stlGenerator.js';

// ── State ─────────────────────────────────────────────────────────────────────
let imgState = null;     // { imageData, width, height, objectURL }
let quantResult = null;  // { centroids, assignment }
let selectedLayers = new Set();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screenUpload = document.getElementById('screen-upload');
const screenEditor = document.getElementById('screen-editor');
const dropZone     = document.getElementById('drop-zone');
const fileInput    = document.getElementById('file-input');
const thumbImg     = document.getElementById('thumb');
const colorSlider  = document.getElementById('color-count');
const colorDisplay = document.getElementById('color-count-display');
const paletteBar   = document.getElementById('palette-bar');
const layersGrid   = document.getElementById('layers-grid');
const btnNew       = document.getElementById('btn-new');
const errorBanner  = document.getElementById('error-banner');

// Composite panel
const compositePanelEl = document.getElementById('composite-panel');
const compositeCanvas  = document.getElementById('composite-canvas');
const compositeCount   = document.getElementById('composite-count');
const btnCompositePng  = document.getElementById('btn-composite-png');
const btnDeselectAll   = document.getElementById('btn-deselect-all');

// Plate options
const optWidth    = document.getElementById('opt-width');
const optHeight   = document.getElementById('opt-height');
const optPlateH   = document.getElementById('opt-plate-h');
const optReliefH  = document.getElementById('opt-relief-h');
const optQuality  = document.getElementById('opt-quality');
const optInvert   = document.getElementById('opt-invert');
const btnFrame    = document.getElementById('btn-frame');

// ── Upload & drop ─────────────────────────────────────────────────────────────
// The "Browse" button is inside the drop zone; stop propagation so the
// drop zone click handler doesn't open the dialog a second time.
document.querySelector('.btn-browse').addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f && /image\//.test(f.type)) handleFile(f);
});

btnNew.addEventListener('click', () => {
  if (imgState) URL.revokeObjectURL(imgState.objectURL);
  imgState = null;
  quantResult = null;
  fileInput.value = '';
  showScreen('upload');
});

// ── Color slider ──────────────────────────────────────────────────────────────
let debounceTimer = null;
colorSlider.addEventListener('input', () => {
  colorDisplay.textContent = colorSlider.value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reprocess, 180);
});

// ── File handling ─────────────────────────────────────────────────────────────
async function handleFile(file) {
  clearError();
  try {
    if (imgState) URL.revokeObjectURL(imgState.objectURL);
    imgState = await loadImageData(file);
    thumbImg.src = imgState.objectURL;
    showScreen('editor');
    reprocess();
  } catch (err) {
    showError('Image error: ' + err.message);
  }
}

function reprocess() {
  if (!imgState) return;
  const k = parseInt(colorSlider.value, 10);
  quantResult = quantize(imgState.imageData, k);
  renderPalette();
  renderLayers();
}

// ── Palette bar ───────────────────────────────────────────────────────────────
function renderPalette() {
  paletteBar.innerHTML = '';
  const { centroids } = quantResult;
  centroids.forEach(c => {
    const hex = centroidToHex(c);
    const chip = document.createElement('div');
    chip.className = 'palette-chip';
    chip.style.background = hex;
    chip.title = hex;
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.style.color = isLight(c) ? '#333' : '#fff';
    label.textContent = hex;
    chip.appendChild(label);
    paletteBar.appendChild(chip);
  });
}

// ── Layer cards ───────────────────────────────────────────────────────────────
function renderLayers() {
  layersGrid.innerHTML = '';
  selectedLayers.clear();
  compositePanelEl.hidden = true;

  const { centroids, assignment } = quantResult;
  const counts = pixelCounts(assignment, centroids.length);
  const totalPx = counts.reduce((s, c) => s + c, 0);

  centroids.forEach((centroid, i) => {
    if (!counts[i]) return;

    const hex = centroidToHex(centroid);
    const pct = Math.round((counts[i] / totalPx) * 100);

    const card = document.createElement('div');
    card.className = 'layer-card';

    // Selection indicator
    const check = document.createElement('div');
    check.className = 'select-check';
    check.textContent = '✓';

    // Canvas preview
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'canvas-wrap';
    const canvas = document.createElement('canvas');
    renderLayerCanvas(canvas, assignment, i, centroid, imgState.width, imgState.height);
    canvasWrap.append(check, canvas);

    // Footer inside card
    const footer = document.createElement('div');
    footer.className = 'layer-footer';

    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    swatch.style.background = hex;

    const meta = document.createElement('div');
    meta.className = 'layer-meta';
    meta.innerHTML = `<span class="layer-hex">${hex}</span><span class="layer-pct">${pct}%</span>`;

    const btn = document.createElement('button');
    btn.className = 'btn-stl';
    btn.textContent = 'Download STL';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      downloadSTL(btn, i, hex);
    });

    footer.append(swatch, meta, btn);
    card.append(canvasWrap, footer);

    card.addEventListener('click', () => toggleLayerSelection(card, i));

    layersGrid.appendChild(card);
  });
}

function toggleLayerSelection(card, index) {
  if (selectedLayers.has(index)) {
    selectedLayers.delete(index);
    card.classList.remove('selected');
  } else {
    selectedLayers.add(index);
    card.classList.add('selected');
  }
  updateComposite();
}

function updateComposite() {
  if (selectedLayers.size === 0) {
    compositePanelEl.hidden = true;
    return;
  }
  compositePanelEl.hidden = false;
  const n = selectedLayers.size;
  compositeCount.textContent = `${n} layer${n > 1 ? 's' : ''} selected`;
  renderCompositeCanvas(
    compositeCanvas,
    quantResult.assignment,
    [...selectedLayers],
    quantResult.centroids,
    imgState.width,
    imgState.height
  );
}

// ── Composite panel actions ───────────────────────────────────────────────────
btnCompositePng.addEventListener('click', () => {
  compositeCanvas.toBlob(blob => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'composite.png',
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
});

btnDeselectAll.addEventListener('click', () => {
  selectedLayers.clear();
  layersGrid.querySelectorAll('.layer-card.selected').forEach(c => c.classList.remove('selected'));
  compositePanelEl.hidden = true;
});

// ── STL download ──────────────────────────────────────────────────────────────
function downloadSTL(btn, colorIndex, hex) {
  const original = btn.textContent;
  btn.textContent = 'Generating…';
  btn.disabled = true;

  // Yield to browser so button state updates before heavy work
  setTimeout(() => {
    try {
      const opts = {
        width:        parseFloat(optWidth.value)   || 100,
        height:       parseFloat(optHeight.value)  || 100,
        plateHeight:  parseFloat(optPlateH.value)  || 1,
        reliefHeight: parseFloat(optReliefH.value) || 1,
        maxRes:       parseInt(optQuality.value, 10),
        invert:       optInvert.checked,
      };
      const stl = generateLayerSTL(
        quantResult.assignment, colorIndex,
        imgState.width, imgState.height, opts
      );
      triggerDownload(stl, `layer_${colorIndex + 1}_${hex.slice(1)}.stl`);
    } catch (err) {
      showError('Error generating STL: ' + err.message);
      console.error(err);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }, 30);
}

function triggerDownload(data, filename) {
  const blob = new Blob([data], { type: 'model/stl' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ── Frame STL download ────────────────────────────────────────────────────────
btnFrame.addEventListener('click', () => {
  const original = btnFrame.textContent;
  btnFrame.textContent = 'Generating…';
  btnFrame.disabled = true;

  setTimeout(() => {
    try {
      const opts = {
        width:        parseFloat(optWidth.value)   || 100,
        height:       parseFloat(optHeight.value)  || 100,
        plateHeight:  parseFloat(optPlateH.value)  || 1,
        reliefHeight: parseFloat(optReliefH.value) || 1,
      };
      const stl = generateFrameSTL(opts);
      triggerDownload(stl, `frame_${opts.width}x${opts.height}mm.stl`);
    } catch (err) {
      showError('Error generating frame: ' + err.message);
    } finally {
      btnFrame.textContent = original;
      btnFrame.disabled = false;
    }
  }, 30);
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function showScreen(name) {
  screenUpload.hidden = name !== 'upload';
  screenEditor.hidden = name !== 'editor';
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
}
function clearError() {
  errorBanner.hidden = true;
}
