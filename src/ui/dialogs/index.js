import { appState, keyGuidanceDialogState, resetKeyActionsMenuState } from '../../state/appState.js';
import { applyCountrySort } from '../sidebar.js';
import { onSelectionChanged } from '../reportTable.js';
import { showLoadingIndicator, hideLoadingIndicator, showLoadingError } from '../loadingIndicator.js';
import {
  getWeightsOverrides,
  setWeightsOverrides,
  invalidateCountryMetricsCache,
} from '../../data/weights.js';

function getKeyGuidanceDetails(keyObj) {
  if (!keyObj || typeof keyObj.Key !== 'string') return null;
  const keyName = keyObj.Key;
  const fromMap = appState.keyGuidanceIndex instanceof Map ? appState.keyGuidanceIndex.get(keyName) : undefined;
  let guidance = typeof keyObj.Guidance === 'string' ? keyObj.Guidance.trim() : '';
  if (!guidance && fromMap && typeof fromMap.guidance === 'string') {
    guidance = fromMap.guidance.trim();
  }
  const ratingGuide = Array.isArray(keyObj.RatingGuide) && keyObj.RatingGuide.length > 0
    ? keyObj.RatingGuide
    : (fromMap && Array.isArray(fromMap.ratingGuide) ? fromMap.ratingGuide : []);
  const considerations = typeof keyObj.RatingConsiderations === 'string' && keyObj.RatingConsiderations.trim().length > 0
    ? keyObj.RatingConsiderations.trim()
    : (fromMap && typeof fromMap.considerations === 'string' ? fromMap.considerations.trim() : '');
  if (!guidance && ratingGuide.length === 0 && !considerations) {
    return null;
  }
  return { key: keyName, guidance, ratingGuide, considerations };
}

function ensureKeyGuidanceDialogSetup(dialog) {
  if (!dialog || dialog.dataset.kgSetup === 'true') return;
  const closeBtn = dialog.querySelector('.kg-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      try { dialog.close(); } catch {}
    });
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    try { dialog.close(); } catch {}
  });
  dialog.addEventListener('close', () => {
    if (keyGuidanceDialogState.lastTrigger && typeof keyGuidanceDialogState.lastTrigger.focus === 'function') {
      try { keyGuidanceDialogState.lastTrigger.focus(); } catch {}
    }
    keyGuidanceDialogState.lastTrigger = null;
  });
  dialog.dataset.kgSetup = 'true';
}

export function openKeyGuidanceDialog(categoryName, keyObj, trigger) {
  const details = getKeyGuidanceDetails(keyObj);
  if (!details) return;
  const dialog = document.getElementById('keyGuidanceDialog');
  if (!dialog) return;
  ensureKeyGuidanceDialogSetup(dialog);
  keyGuidanceDialogState.lastTrigger = (trigger instanceof HTMLElement) ? trigger : null;

  const titleEl = dialog.querySelector('.kg-title');
  if (titleEl) {
    titleEl.textContent = details.key || 'Key guidance';
  }
  const subtitleEl = dialog.querySelector('.kg-subtitle');
  if (subtitleEl) {
    if (categoryName) {
      subtitleEl.textContent = categoryName;
      subtitleEl.hidden = false;
    } else {
      subtitleEl.textContent = '';
      subtitleEl.hidden = true;
    }
  }
  const guidanceEl = dialog.querySelector('#kgKeyGuidanceText');
  if (guidanceEl) {
    guidanceEl.textContent = details.guidance || 'No key guidance available.';
  }
  const considerationsEl = dialog.querySelector('#kgConsiderations');
  if (considerationsEl) {
    if (details.considerations) {
      considerationsEl.textContent = details.considerations;
      considerationsEl.hidden = false;
    } else {
      considerationsEl.textContent = '';
      considerationsEl.hidden = true;
    }
  }
  const tbody = dialog.querySelector('#kgTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    if (Array.isArray(details.ratingGuide) && details.ratingGuide.length > 0) {
      details.ratingGuide.forEach(entry => {
        const row = document.createElement('tr');
        const ratingCell = document.createElement('td');
        ratingCell.textContent = String(entry.rating);
        ratingCell.className = 'kg-rating-cell';
        row.appendChild(ratingCell);
        const textCell = document.createElement('td');
        textCell.textContent = entry.guidance;
        row.appendChild(textCell);
        tbody.appendChild(row);
      });
    } else {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'kg-empty';
      cell.textContent = 'No rating guidance available.';
      row.appendChild(cell);
      tbody.appendChild(row);
    }
  }

  try {
    dialog.showModal();
  } catch {
    try { dialog.show(); } catch {}
  }
}

export function makeKeyGuidanceButton(categoryName, keyObj) {
  const details = getKeyGuidanceDetails(keyObj);
  if (!details) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'key-guidance-btn';
  btn.textContent = 'Guide';
  btn.title = 'View key and rating guidance';
  btn.setAttribute('aria-label', `View guidance for ${keyObj.Key}`);
  btn.addEventListener('click', (event) => {
    try { event.preventDefault(); event.stopPropagation(); } catch {}
    openKeyGuidanceDialog(categoryName, keyObj, event.currentTarget);
  });
  return btn;
}

export function openWeightsDialog(mainData) {
  const dlg = document.getElementById('weightsDialog');
  const body = document.getElementById('weightsDialogBody');
  const btnSave = document.getElementById('weightsSave');
  const btnCancel = document.getElementById('weightsCancel');
  const btnReset = document.getElementById('weightsReset');
  if (!dlg || !body) return;

  body.innerHTML = '';
  const overrides = getWeightsOverrides();
  const categories = Array.isArray(mainData.Categories) ? mainData.Categories.map(c => c.Category) : [];
  const people = Array.isArray(mainData.People) ? mainData.People : [];

  people.forEach(person => {
    const section = document.createElement('div');
    section.className = 'wd-section';
    const h = document.createElement('h4');
    h.textContent = person.name;
    section.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'wd-grid';
    const personOv = overrides[person.name] || {};
    categories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'wd-row';
      const lab = document.createElement('label');
      lab.textContent = cat;
      const wrap = document.createElement('div');
      wrap.className = 'wd-slider';
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '10'; slider.step = '0.1';
      const fallback = Number((person.weights || {})[cat]);
      const current = (typeof personOv[cat] !== 'undefined') ? Number(personOv[cat]) : (isFinite(fallback) ? fallback : 0);
      slider.value = String(isFinite(current) ? current : 0);
      slider.dataset.person = person.name;
      slider.dataset.category = cat;
      const out = document.createElement('output');
      out.value = slider.value;
      out.textContent = slider.value;
      slider.addEventListener('input', () => { out.value = slider.value; out.textContent = slider.value; });
      wrap.appendChild(slider);
      wrap.appendChild(out);
      grid.appendChild(lab);
      grid.appendChild(wrap);
    });
    section.appendChild(grid);
    body.appendChild(section);
  });

  function closeDialog() { try { dlg.close(); } catch {} }

  if (btnCancel) btnCancel.onclick = () => closeDialog();
  if (btnReset) btnReset.onclick = () => {
    setWeightsOverrides({});
    invalidateCountryMetricsCache();
    afterWeightsChanged(mainData);
    closeDialog();
  };
  if (btnSave) btnSave.onclick = () => {
    const inputs = body.querySelectorAll('input[type="range"][data-person][data-category]');
    const next = getWeightsOverrides();
    inputs.forEach(inp => {
      const person = inp.dataset.person;
      const category = inp.dataset.category;
      const val = Number(inp.value);
      if (!next[person]) next[person] = {};
      next[person][category] = isFinite(val) ? val : 0;
    });
    setWeightsOverrides(next);
    invalidateCountryMetricsCache();
    afterWeightsChanged(mainData);
    closeDialog();
  };

  try { dlg.showModal(); } catch { try { dlg.show(); } catch {} }
}

function allowLoadingIndicatorPaint() {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        // Use a timeout to ensure the frame is committed before heavy work.
        setTimeout(resolve, 0);
      });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function afterWeightsChanged(mainData) {
  const listEl = document.getElementById('countryList');
  const notice = document.getElementById('notice');
  let refreshed = false;
  showLoadingIndicator('Updating report with new weights…');
  try {
    await allowLoadingIndicatorPaint();
    await applyCountrySort(mainData, listEl, notice);
    onSelectionChanged(mainData, notice);
    refreshed = true;
  } catch (error) {
    console.warn('Failed to refresh report after weights update', error);
    showLoadingError('We hit a snag updating the report with the new weights.');
  } finally {
    if (refreshed) {
      hideLoadingIndicator();
    }
  }
}

export default {
  openKeyGuidanceDialog,
  makeKeyGuidanceButton,
  openWeightsDialog,
  afterWeightsChanged,
};

