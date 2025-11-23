import { appState } from '../state/appState.js';
import { getStored, setStored } from '../storage/preferences.js';
import { saveSelectedToStorage } from '../storage/selection.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics } from '../data/scoring.js';
import { getEffectivePeople } from '../data/weights.js';
import { createFlagImg } from '../utils/dom.js';
import { makeScoreChip } from './components/chips.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';
import { isInformationalKey } from '../data/informationalOverrides.js';
import { updateCountryListSelection, renderCountryList, updateCollapseCountriesButton } from './sidebar.js';
import { onSelectionChanged } from './reportTable.js';
import { setActiveView } from './viewTabs.js';

const STORAGE_KEY = 'funnelFilters';

const funnelState = {
  filters: [],
  keyIndex: new Map(),
  keysByCategory: new Map(),
  rowsContainer: null,
  dialog: null,
  form: null,
  categorySelect: null,
  keySelect: null,
  minSelect: null,
  joinSelect: null,
  mainData: null,
  currentEditIndex: null,
  reportCache: new Map(),
};

const dragState = {
  sourceIndex: null,
  sourceElement: null,
  indicator: null,
  lastTarget: null,
  hideTimer: null,
};

function normalizeKey(value) {
  try {
    let text = typeof value === 'string' ? value : '';
    if (text.normalize) text = text.normalize('NFKC');
    text = text.replace(/[°�?]/g, '');
    text = text.toLowerCase();
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  } catch {
    return String(value || '');
  }
}

function getKeyDisplay(id) {
  const meta = funnelState.keyIndex.get(normalizeKey(id));
  return meta || { id, label: id, category: '' };
}

function loadStoredFilters() {
  const raw = getStored(STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const keyId = typeof entry.keyId === 'string' ? entry.keyId : String(entry.keyId || '');
      const minAlignment = Number(entry.minAlignment);
      const conjunction = entry?.conjunction === 'or' ? 'or' : 'and';
      if (!keyId) return null;
      return {
        keyId,
        minAlignment: Number.isFinite(minAlignment) ? minAlignment : 0,
        conjunction,
      };
    })
    .filter(Boolean);
}

function persistFilters() {
  setStored(STORAGE_KEY, funnelState.filters);
}

function normalizeRatingGuide(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(entry => {
      const rating = Number(entry?.rating ?? entry?.Rating ?? entry?.value);
      if (!Number.isFinite(rating)) return null;
      const guidance = typeof entry?.guidance === 'string'
        ? entry.guidance
        : (typeof entry?.Guidance === 'string' ? entry.Guidance : '');
      return { rating, guidance };
    })
    .filter(Boolean)
    .sort((a, b) => a.rating - b.rating);
}

function buildKeyIndex(mainData) {
  funnelState.keyIndex = new Map();
  funnelState.keysByCategory = new Map();
  const categories = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  categories.forEach(cat => {
    const categoryName = typeof cat?.Category === 'string' ? cat.Category : '';
    const keys = Array.isArray(cat?.Keys) ? cat.Keys : [];
    const normalizedCategory = categoryName || 'Uncategorized';
    const list = [];
    keys.forEach(keyObj => {
      const id = keyObj?.KeyId || keyObj?.Id || keyObj?.Key || '';
      if (!id) return;
      const informational = isInformationalKey(keyObj, categoryName);
      const label = keyObj?.Key || id;
      const meta = {
        id,
        label,
        category: normalizedCategory,
        informational,
        ratingGuide: normalizeRatingGuide(keyObj?.RatingGuide || keyObj?.ratingGuide),
      };
      funnelState.keyIndex.set(normalizeKey(id), meta);
      if (!informational) {
        list.push(meta);
      }
    });
    funnelState.keysByCategory.set(normalizedCategory, list);
  });
}

function getRatingGuideForKey(keyId) {
  if (!keyId) return [];
  const meta = getKeyDisplay(keyId);
  return Array.isArray(meta?.ratingGuide) ? meta.ratingGuide : [];
}

function getAllReportNodes() {
  const nodes = [];
  appState.countries.forEach(country => {
    (country.cities || []).forEach(city => nodes.push(city));
  });
  return nodes;
}

function compareNodes(a, b) {
  const nameA = typeof a?.name === 'string' ? a.name : '';
  const nameB = typeof b?.name === 'string' ? b.name : '';
  const primary = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  if (primary !== 0) return primary;
  const parentA = typeof a?.parentCountry?.name === 'string' ? a.parentCountry.name : '';
  const parentB = typeof b?.parentCountry?.name === 'string' ? b.parentCountry.name : '';
  return parentA.localeCompare(parentB, undefined, { sensitivity: 'base' });
}

async function ensureReportEntry(node) {
  if (!node || !node.file) return { data: { values: [] }, metrics: {} };
  if (funnelState.reportCache.has(node.file)) {
    return funnelState.reportCache.get(node.file);
  }
  const data = await fetchCountry(node.file, {
    parentFile: getParentFileForNode(node),
    resolveParentFile: resolveParentReportFile,
  });
  if (data && data.iso && !node.iso) node.iso = String(data.iso);
  if (!node.metrics) {
    node.metrics = computeRoundedMetrics(data, funnelState.mainData, getEffectivePeople(funnelState.mainData));
  }
  const entry = { data, metrics: node.metrics };
  funnelState.reportCache.set(node.file, entry);
  return entry;
}

function findValueForKey(reportData, keyId) {
  const target = normalizeKey(keyId);
  const values = Array.isArray(reportData?.values) ? reportData.values : [];
  return values.find(entry => normalizeKey(entry?.key) === target) || null;
}

function activateReportSelection(node) {
  if (!node) return;
  if (node.type === 'city') {
    appState.showCitiesOnly = true;
    setStored('showCitiesOnly', true);
    const toggle = document.getElementById('citiesOnlyToggle');
    if (toggle) toggle.checked = true;
    const listEl = document.getElementById('countryList');
    const notice = document.getElementById('notice');
    updateCollapseCountriesButton();
    if (listEl) {
      renderCountryList(listEl, appState.countries, notice, () => {
        void onSelectionChanged(funnelState.mainData, notice);
      });
    }
  }
  setActiveView('dataView');
  appState.selected = [node];
  saveSelectedToStorage();
  const listEl = document.getElementById('countryList');
  const notice = document.getElementById('notice');
  if (listEl) {
    updateCountryListSelection(listEl);
  }
  void onSelectionChanged(funnelState.mainData, notice);
}

function handleFunnelReportActivate(node, filter) {
  if (node?.type === 'city' && filter?.keyId) {
    const meta = getKeyDisplay(filter.keyId);
    appState.pendingKeyFocus = {
      keyId: meta.id,
      keyLabel: meta.label,
      category: meta.category,
    };
  } else {
    appState.pendingKeyFocus = null;
  }
  activateReportSelection(node);
}

async function evaluateFilter(nodes, filter) {
  const min = Number(filter?.minAlignment);
  const threshold = Number.isFinite(min) ? min : 0;
  const withData = await Promise.all(nodes.map(async node => ({ node, entry: await ensureReportEntry(node) })));
  const excluded = [];
  const included = [];
  withData.forEach(({ node, entry }) => {
    const valueEntry = findValueForKey(entry.data, filter.keyId);
    const numeric = Number(valueEntry?.alignmentValue);
    if (Number.isFinite(numeric) && numeric >= threshold) {
      included.push(node);
    } else {
      excluded.push(node);
    }
  });
  excluded.sort(compareNodes);
  included.sort(compareNodes);
  return { excluded, included };
}

function makeReportPill(node, options = {}) {
  const pill = document.createElement('div');
  pill.className = 'funnel-report-pill';
  pill.setAttribute('role', 'button');
  pill.tabIndex = 0;
  pill.setAttribute('aria-label', `Open ${node?.name || 'report'} in data view`);

  const metrics = node?.metrics || {};
  const chip = makeScoreChip(metrics.overall, { labelPrefix: 'Alignment score' });
  chip.classList.add('right-chip');
  pill.appendChild(chip);

  if (node?.iso) {
    const flagName = node?.parentCountry?.name || '';
    const flag = createFlagImg(node.iso, 16, flagName);
    if (flag) pill.appendChild(flag);
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'name-wrap';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = node?.name || 'Unknown report';
  textWrap.appendChild(name);
  if (node?.parentCountry?.name) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = node.parentCountry.name;
    textWrap.appendChild(meta);
  }
  pill.appendChild(textWrap);

  const handleActivate = () => {
    if (typeof options.onActivate === 'function') {
      options.onActivate(node);
    } else {
      activateReportSelection(node);
    }
  };
  pill.addEventListener('click', handleActivate);
  pill.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  });

  return pill;
}

function renderReportList(nodes, emptyText, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'funnel-report-list';
  if (!nodes || nodes.length === 0) {
    if (!emptyText) {
      return wrapper;
    }
    const empty = document.createElement('p');
    empty.className = 'funnel-empty';
    empty.textContent = emptyText;
    wrapper.appendChild(empty);
    return wrapper;
  }
  nodes.forEach(node => wrapper.appendChild(makeReportPill(node, options)));
  return wrapper;
}

function getDropIndicator() {
  if (!dragState.indicator) {
    const indicator = document.createElement('div');
    indicator.className = 'funnel-row funnel-drop-ghost';
    indicator.setAttribute('aria-hidden', 'true');

    const excluded = document.createElement('div');
    excluded.className = 'funnel-cell funnel-drop-ghost__cell';
    indicator.appendChild(excluded);

    const included = document.createElement('div');
    included.className = 'funnel-cell funnel-drop-ghost__cell';
    indicator.appendChild(included);

    dragState.indicator = indicator;
  }
  return dragState.indicator;
}

function formatFilterRuleText(filter) {
  if (!filter) return '';
  const { label } = getKeyDisplay(filter.keyId);
  const guide = getRatingGuideForKey(filter.keyId);
  const numericMin = Number(filter.minAlignment);
  const matchedGuide = guide.find(entry => entry.rating === numericMin);
  const guidanceText = matchedGuide?.guidance?.trim();
  const thresholdLabel = guidanceText || `${filter.minAlignment}`;
  return `${label} - ${thresholdLabel}`;
}

function updateDropGhostContent() {
  const indicator = getDropIndicator();
  const cells = indicator.querySelectorAll('.funnel-drop-ghost__cell');
  const sourceFilter = funnelState.filters[dragState.sourceIndex];
  const label = sourceFilter ? formatFilterRuleText(sourceFilter) : 'Move filter here';
  cells.forEach(cell => { cell.textContent = label; });
}

function clearDropIndicator() {
  const indicator = dragState.indicator;
  dragState.lastTarget = null;
  if (!indicator) return;
  if (dragState.hideTimer) {
    clearTimeout(dragState.hideTimer);
    dragState.hideTimer = null;
  }
  if (!indicator.parentNode) {
    indicator.classList.remove('funnel-drop-ghost--visible', 'funnel-drop-ghost--hiding');
    return;
  }

  indicator.classList.remove('funnel-drop-ghost--visible');
  indicator.classList.add('funnel-drop-ghost--hiding');

  const removeIndicator = () => {
    if (dragState.hideTimer) {
      clearTimeout(dragState.hideTimer);
      dragState.hideTimer = null;
    }
    indicator.parentNode?.removeChild(indicator);
    indicator.classList.remove('funnel-drop-ghost--hiding');
  };

  indicator.addEventListener('transitionend', removeIndicator, { once: true });
  dragState.hideTimer = window.setTimeout(removeIndicator, 320);
}

function positionDropIndicator(targetRow, before = true) {
  if (!targetRow || !targetRow.parentNode) return;
  const indicator = getDropIndicator();
  indicator.classList.remove('funnel-drop-ghost--hiding');
  if (dragState.hideTimer) {
    clearTimeout(dragState.hideTimer);
    dragState.hideTimer = null;
  }
  updateDropGhostContent();
  dragState.lastTarget = { targetIndex: Number(targetRow.dataset.filterIndex), before };
  if (before) {
    targetRow.parentNode.insertBefore(indicator, targetRow);
  } else {
    targetRow.parentNode.insertBefore(indicator, targetRow.nextSibling);
  }
  requestAnimationFrame(() => indicator.classList.add('funnel-drop-ghost--visible'));
}

function handleDragStart(event, index) {
  dragState.sourceIndex = index;
  dragState.sourceElement = event.target.closest('.funnel-row');
  dragState.sourceElement?.classList.add('funnel-row--dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(index));
}

function handleDragEnd() {
  dragState.sourceIndex = null;
  dragState.lastTarget = null;
  dragState.sourceElement?.classList.remove('funnel-row--dragging');
  dragState.sourceElement = null;
  clearDropIndicator();
}

function getTargetFromEvent(event) {
  return event.target.closest('[data-filter-index]');
}

function computeDropTarget(event, targetRow) {
  const rect = targetRow.getBoundingClientRect();
  const isAddRow = targetRow.classList.contains('funnel-row--add');
  const before = isAddRow ? true : event.clientY < (rect.top + rect.height / 2);
  if (isAddRow && before === false) return null;
  const targetIndex = Number(targetRow.dataset.filterIndex);
  const sourceIndex = dragState.sourceIndex;
  if (sourceIndex === null || Number.isNaN(targetIndex)) return null;
  let insertIndex = before ? targetIndex : targetIndex + 1;
  if (sourceIndex < insertIndex) insertIndex -= 1;
  if (insertIndex === sourceIndex) return null;
  return { before, targetIndex };
}

function handleDragOver(event) {
  if (dragState.sourceIndex === null) return;
  const targetRow = getTargetFromEvent(event);
  if (!targetRow) {
    const indicator = dragState.indicator;
    if (indicator?.isConnected) {
      const rect = indicator.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        event.preventDefault();
        return;
      }
    }
    clearDropIndicator();
    dragState.lastTarget = null;
    return;
  }
  const dropMeta = computeDropTarget(event, targetRow);
  if (!dropMeta) {
    clearDropIndicator();
    dragState.lastTarget = null;
    return;
  }
  const { before, targetIndex } = dropMeta;
  event.preventDefault();
  const indicator = dragState.indicator;
  const isSameTarget =
    dragState.lastTarget?.targetIndex === targetIndex &&
    dragState.lastTarget?.before === before &&
    indicator?.parentNode === targetRow.parentNode &&
    ((before && indicator?.nextSibling === targetRow) || (!before && indicator?.previousSibling === targetRow));

  if (!isSameTarget) {
    positionDropIndicator(targetRow, before);
  }
}

function handleDrop(event) {
  if (dragState.sourceIndex === null) return;
  const targetRow = getTargetFromEvent(event);
  const dropMeta = targetRow ? computeDropTarget(event, targetRow) : dragState.lastTarget;
  if (!dropMeta) {
    clearDropIndicator();
    dragState.lastTarget = null;
    dragState.sourceElement?.classList.remove('funnel-row--dragging');
    dragState.sourceElement = null;
    dragState.sourceIndex = null;
    return;
  }
  const { before, targetIndex } = dropMeta;
  event.preventDefault();
  let insertIndex = before ? targetIndex : targetIndex + 1;
  const sourceIndex = dragState.sourceIndex;
  clearDropIndicator();
  dragState.sourceIndex = null;
  dragState.lastTarget = null;
  dragState.sourceElement?.classList.remove('funnel-row--dragging');
  dragState.sourceElement = null;
  if (Number.isNaN(insertIndex) || sourceIndex === insertIndex) return;
  const [moved] = funnelState.filters.splice(sourceIndex, 1);
  if (!moved) return;
  if (sourceIndex < insertIndex) insertIndex -= 1;
  insertIndex = Math.max(0, Math.min(insertIndex, funnelState.filters.length));
  funnelState.filters.splice(insertIndex, 0, moved);
  persistFilters();
  void renderFunnel();
}

function makeFilterSummary(filter) {
  const container = document.createElement('div');
  container.className = 'funnel-filter-summary';
  const title = document.createElement('div');
  title.className = 'funnel-filter-summary__rule';
  title.textContent = formatFilterRuleText(filter);
  const logic = document.createElement('span');
  const conjunction = filter?.conjunction === 'or' ? 'or' : 'and';
  logic.className = `funnel-filter-summary__logic funnel-filter-summary__logic--${conjunction}`;
  logic.textContent = conjunction === 'or' ? 'OR' : 'AND';
  container.appendChild(logic);
  container.appendChild(title);
  return container;
}

function makeFilterRow(filter, index, excluded, included) {
  const row = document.createElement('div');
  row.className = 'funnel-row';
  row.dataset.filterIndex = String(index);

  const excludedCell = document.createElement('div');
  excludedCell.className = 'funnel-cell';

  const controls = document.createElement('div');
  controls.className = 'funnel-cell__controls';

  controls.appendChild(makeFilterSummary(filter));

  const actions = document.createElement('div');
  actions.className = 'funnel-filter-actions';

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'funnel-drag-handle';
  dragHandle.setAttribute('aria-label', 'Reorder filter');
  dragHandle.textContent = '☰';
  dragHandle.draggable = true;
  dragHandle.addEventListener('dragstart', event => handleDragStart(event, index));
  dragHandle.addEventListener('dragend', handleDragEnd);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'funnel-icon-button funnel-icon-button--edit';
  editBtn.setAttribute('aria-label', 'Edit filter');
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => openFilterDialog({ editIndex: index }));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'funnel-icon-button funnel-icon-button--remove';
  removeBtn.setAttribute('aria-label', 'Remove filter');
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    funnelState.filters.splice(index, 1);
    persistFilters();
    void renderFunnel();
  });

  actions.appendChild(dragHandle);
  actions.appendChild(editBtn);
  actions.appendChild(removeBtn);
  controls.appendChild(actions);

  const activateWithFilter = (node) => handleFunnelReportActivate(node, filter);
  excludedCell.appendChild(renderReportList(excluded, 'No reports excluded by this filter.', { onActivate: activateWithFilter }));
  excludedCell.appendChild(controls);

  const includedCell = document.createElement('div');
  includedCell.className = 'funnel-cell';
  includedCell.appendChild(renderReportList(included, 'No reports remain after this filter.', { onActivate: activateWithFilter }));

  row.appendChild(excludedCell);
  row.appendChild(includedCell);
  return row;
}

function makeAddRow(remaining) {
  const row = document.createElement('div');
  row.className = 'funnel-row';
  row.classList.add('funnel-row--add');
  row.dataset.filterIndex = String(funnelState.filters.length);

  const excludedCell = document.createElement('div');
  excludedCell.className = 'funnel-cell';

  const controls = document.createElement('div');
  controls.className = 'funnel-cell__controls funnel-cell__controls--center';

  const actions = document.createElement('div');
  actions.className = 'funnel-filter-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'funnel-icon-button funnel-icon-button--add';
  addBtn.setAttribute('aria-label', 'Add filter');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => openFilterDialog({ editIndex: null }));
  actions.appendChild(addBtn);
  controls.appendChild(actions);

  excludedCell.appendChild(renderReportList([], ''));
  excludedCell.appendChild(controls);

  const includedCell = document.createElement('div');
  includedCell.className = 'funnel-cell';
  includedCell.appendChild(renderReportList(remaining, 'No reports available.'));

  row.appendChild(excludedCell);
  row.appendChild(includedCell);
  return row;
}

function populateCategories() {
  if (!funnelState.categorySelect) return;
  const categories = Array.from(funnelState.keysByCategory.keys());
  funnelState.categorySelect.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    funnelState.categorySelect.appendChild(opt);
  });
}

function populateKeys(categoryName, selectedKeyId = '') {
  if (!funnelState.keySelect) return;
  const keys = funnelState.keysByCategory.get(categoryName) || [];
  funnelState.keySelect.innerHTML = '';
  let matched = false;
  keys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key.id;
    opt.textContent = key.label;
    if (selectedKeyId && normalizeKey(selectedKeyId) === normalizeKey(key.id)) {
      opt.selected = true;
      matched = true;
    }
    funnelState.keySelect.appendChild(opt);
  });
  if (selectedKeyId && !matched) {
    const fallback = getKeyDisplay(selectedKeyId);
    const opt = document.createElement('option');
    opt.value = fallback.id;
    opt.textContent = fallback.label;
    opt.selected = true;
    funnelState.keySelect.appendChild(opt);
  }
  if (!funnelState.keySelect.value && keys[0]) {
    funnelState.keySelect.value = keys[0].id;
  }
}

function populateMinimumOptions(selectedValue = null) {
  if (!funnelState.minSelect || !funnelState.keySelect) return;
  const guide = getRatingGuideForKey(funnelState.keySelect.value);
  const options = guide.length > 0
    ? guide
    : Array.from({ length: 11 }, (_, i) => ({ rating: i, guidance: '' }));
  funnelState.minSelect.innerHTML = '';

  options.forEach(entry => {
    const opt = document.createElement('option');
    opt.value = String(entry.rating);
    const label = entry.guidance ? `${entry.rating} – ${entry.guidance}` : String(entry.rating);
    opt.textContent = label;
    funnelState.minSelect.appendChild(opt);
  });

  const numeric = Number(selectedValue);
  if (Number.isFinite(numeric)) {
    const hasOption = options.some(opt => opt.rating === numeric);
    if (!hasOption) {
      const custom = document.createElement('option');
      custom.value = String(numeric);
      custom.textContent = String(numeric);
      funnelState.minSelect.appendChild(custom);
    }
    funnelState.minSelect.value = String(numeric);
  } else {
    const defaultValue = options.find(opt => opt.rating === 7)?.rating ?? options[options.length - 1]?.rating;
    if (typeof defaultValue !== 'undefined') {
      funnelState.minSelect.value = String(defaultValue);
    }
  }
}

function openFilterDialog({ editIndex = null } = {}) {
  if (!funnelState.dialog) return;
  funnelState.currentEditIndex = (typeof editIndex === 'number') ? editIndex : null;
  const isEdit = funnelState.currentEditIndex !== null;
  const existing = isEdit ? funnelState.filters[funnelState.currentEditIndex] : null;
  const targetKey = existing?.keyId;
  const targetMeta = targetKey ? getKeyDisplay(targetKey) : null;
  const category = targetMeta?.category || funnelState.categorySelect?.value;
  populateCategories();
  if (category) {
    funnelState.categorySelect.value = category;
  }
  populateKeys(funnelState.categorySelect.value, targetKey);
  populateMinimumOptions(existing ? existing.minAlignment : null);
  if (funnelState.joinSelect) {
    funnelState.joinSelect.value = existing?.conjunction === 'or' ? 'or' : 'and';
  }
  try {
    if (typeof funnelState.dialog.showModal === 'function') {
      funnelState.dialog.showModal();
    } else if (typeof funnelState.dialog.show === 'function') {
      funnelState.dialog.show();
    } else {
      funnelState.dialog.setAttribute('open', 'true');
    }
  } catch {
    funnelState.dialog.setAttribute('open', 'true');
  }
}

function closeFilterDialog() {
  if (!funnelState.dialog) return;
  funnelState.form?.reset();
  funnelState.currentEditIndex = null;
  try {
    if (typeof funnelState.dialog.close === 'function') {
      funnelState.dialog.close();
    } else {
      funnelState.dialog.removeAttribute('open');
    }
  } catch {
    funnelState.dialog.removeAttribute('open');
  }
}

function handleDialogSubmit(event) {
  event.preventDefault();
  if (!funnelState.keySelect || !funnelState.minSelect) return;
  const keyId = funnelState.keySelect.value;
  const minAlignment = Number(funnelState.minSelect.value);
  const conjunction = funnelState.joinSelect?.value === 'or' ? 'or' : 'and';
  if (!keyId || !Number.isFinite(minAlignment)) {
    return;
  }
  const payload = { keyId, minAlignment, conjunction };
  if (typeof funnelState.currentEditIndex === 'number') {
    funnelState.filters.splice(funnelState.currentEditIndex, 1, payload);
  } else {
    funnelState.filters.push(payload);
  }
  persistFilters();
  closeFilterDialog();
  void renderFunnel();
}

async function renderFunnel() {
  if (!funnelState.rowsContainer) return;
  const rows = funnelState.rowsContainer;
  rows.innerHTML = '';

  const allNodes = getAllReportNodes().sort(compareNodes);
  if (funnelState.filters.length === 0) {
    await Promise.all(allNodes.map(node => ensureReportEntry(node)));
  }
  let activeSet = null;
  for (let i = 0; i < funnelState.filters.length; i += 1) {
    const filter = funnelState.filters[i];
    const isOr = filter?.conjunction === 'or';
    const baseline = activeSet === null
      ? allNodes
      : (isOr
        ? allNodes.filter(node => !activeSet.has(node))
        : Array.from(activeSet));
    const { excluded, included } = await evaluateFilter(baseline, filter);
    if (activeSet === null) {
      activeSet = new Set(included);
    } else if (isOr) {
      included.forEach(node => activeSet.add(node));
    } else {
      const allowed = new Set(included);
      Array.from(activeSet).forEach(node => {
        if (!allowed.has(node)) {
          activeSet.delete(node);
        }
      });
    }
    const includedList = Array.from(activeSet).sort(compareNodes);
    rows.appendChild(makeFilterRow(filter, i, excluded, includedList));
  }
  const finalIncluded = Array.from(activeSet ?? allNodes);
  rows.appendChild(makeAddRow(finalIncluded.sort(compareNodes)));
}

function wireDragAndDrop() {
  if (!funnelState.rowsContainer) return;
  funnelState.rowsContainer.addEventListener('dragover', handleDragOver);
  funnelState.rowsContainer.addEventListener('drop', handleDrop);
}

function wireDialogControls() {
  if (!funnelState.form) return;
  funnelState.form.addEventListener('submit', handleDialogSubmit);
  if (funnelState.categorySelect) {
    funnelState.categorySelect.addEventListener('change', () => {
      populateKeys(funnelState.categorySelect.value);
      populateMinimumOptions();
    });
  }
  if (funnelState.keySelect) {
    funnelState.keySelect.addEventListener('change', () => {
      populateMinimumOptions();
    });
  }
  const cancelBtn = document.getElementById('funnelCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeFilterDialog());
  }
  if (funnelState.dialog) {
    funnelState.dialog.addEventListener('close', () => {
      funnelState.form?.reset();
      funnelState.currentEditIndex = null;
    });
  }
}

function initFunnelView(mainData) {
  if (typeof document === 'undefined') return;
  funnelState.rowsContainer = document.getElementById('funnelRows');
  funnelState.dialog = document.getElementById('funnelFilterDialog');
  funnelState.form = document.getElementById('funnelFilterForm');
  funnelState.categorySelect = document.getElementById('funnelCategorySelect');
  funnelState.keySelect = document.getElementById('funnelKeySelect');
  funnelState.minSelect = document.getElementById('funnelMinSelect');
  funnelState.joinSelect = document.getElementById('funnelJoinSelect');
  funnelState.mainData = mainData;
  if (!funnelState.rowsContainer || !funnelState.dialog || !funnelState.form) return;

  buildKeyIndex(mainData);
  populateCategories();
  populateKeys(funnelState.categorySelect.value);
  populateMinimumOptions();
  funnelState.filters = loadStoredFilters();
  wireDialogControls();
  wireDragAndDrop();
  void renderFunnel();
}

export { initFunnelView };
export default { initFunnelView };
