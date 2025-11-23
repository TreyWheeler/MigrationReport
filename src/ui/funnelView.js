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
  conditionsContainer: null,
  conditionRows: [],
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
      const legacyKeyId = typeof entry.keyId === 'string' ? entry.keyId : String(entry.keyId || '');
      const legacyMin = Number(entry.minAlignment);
      const parsedConditions = Array.isArray(entry.conditions)
        ? entry.conditions
            .map(cond => {
              const keyId = typeof cond?.keyId === 'string' ? cond.keyId : String(cond?.keyId || '');
              const minAlignment = Number(cond?.minAlignment);
              const join = cond?.join === 'or' ? 'or' : 'and';
              const category = typeof cond?.category === 'string' ? cond.category : '';
              if (!keyId || !Number.isFinite(minAlignment)) return null;
              return { keyId, minAlignment, join, category };
            })
            .filter(Boolean)
        : [];
      const conditions = parsedConditions.length > 0
        ? parsedConditions
        : (legacyKeyId
          ? [{ keyId: legacyKeyId, minAlignment: Number.isFinite(legacyMin) ? legacyMin : 0, join: 'and' }]
          : []);
      if (conditions.length === 0) return null;
      return { conditions };
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

function getPrimaryCondition(filter) {
  if (!filter) return null;
  const list = Array.isArray(filter.conditions) ? filter.conditions : [];
  return list.length > 0 ? list[0] : null;
}

function handleFunnelReportActivate(node, filter) {
  const primary = getPrimaryCondition(filter);
  if (node?.type === 'city' && primary?.keyId) {
    const meta = getKeyDisplay(primary.keyId);
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

async function evaluateCondition(nodes, condition) {
  const min = Number(condition?.minAlignment);
  const threshold = Number.isFinite(min) ? min : 0;
  const withData = await Promise.all(nodes.map(async node => ({ node, entry: await ensureReportEntry(node) })));
  const excluded = [];
  const included = [];
  withData.forEach(({ node, entry }) => {
    const valueEntry = findValueForKey(entry.data, condition?.keyId);
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

async function evaluateFilter(nodes, filter) {
  const conditions = Array.isArray(filter?.conditions) ? filter.conditions : [];
  if (conditions.length === 0) {
    return { excluded: nodes.slice().sort(compareNodes), included: [] };
  }
  let activeSet = null;
  for (let i = 0; i < conditions.length; i += 1) {
    const condition = conditions[i];
    const join = condition?.join === 'or' ? 'or' : 'and';
    const baseline = activeSet === null
      ? nodes
      : (join === 'or' ? nodes : Array.from(activeSet));
    const { included } = await evaluateCondition(baseline, condition);
    if (activeSet === null) {
      activeSet = new Set(included);
    } else if (join === 'or') {
      included.forEach(node => activeSet.add(node));
    } else {
      const allowed = new Set(included);
      Array.from(activeSet).forEach(node => {
        if (!allowed.has(node)) {
          activeSet.delete(node);
        }
      });
    }
  }
  const includedList = Array.from(activeSet || []);
  const excludedList = nodes.filter(node => !(activeSet?.has(node))).sort(compareNodes);
  includedList.sort(compareNodes);
  return { excluded: excludedList, included: includedList };
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

function getThresholdParts({ keyId, minAlignment }) {
  const { label } = getKeyDisplay(keyId);
  const guide = getRatingGuideForKey(keyId);
  const numericMin = Number(minAlignment);
  const matchedGuide = guide.find(entry => entry.rating === numericMin);
  const guidanceText = matchedGuide?.guidance?.trim();
  const thresholdLabel = guidanceText || `${minAlignment}`;
  return { label, thresholdLabel };
}

function formatThreshold(condition) {
  const { label, thresholdLabel } = getThresholdParts(condition);
  return `${label}: ${thresholdLabel}`;
}

function formatFilterRuleText(filter) {
  if (!filter) return '';
  const conditions = Array.isArray(filter.conditions) ? filter.conditions : [];
  if (conditions.length === 0) return '';
  return conditions
    .map((condition, index) => {
      const joinLabel = index === 0 ? '' : `${condition?.join === 'or' ? 'OR' : 'AND'} `;
      return `${joinLabel}${formatThreshold(condition)}`;
    })
    .join(' ');
}

function buildFilterRuleContent(filter) {
  const fragment = document.createDocumentFragment();
  if (!filter) return fragment;
  const conditions = Array.isArray(filter.conditions) ? filter.conditions : [];
  conditions.forEach((condition, index) => {
    const row = document.createElement('div');
    row.className = 'funnel-filter-summary__row';

    if (index > 0) {
      const join = document.createElement('span');
      join.className = 'funnel-filter-summary__join';
      join.textContent = condition?.join === 'or' ? 'OR' : 'AND';
      row.appendChild(join);
    }

    const { label, thresholdLabel } = getThresholdParts(condition);
    const threshold = document.createElement('span');
    threshold.className = 'funnel-filter-summary__threshold';

    const keyLabel = document.createElement('span');
    keyLabel.className = 'funnel-filter-summary__key';
    keyLabel.textContent = label;

    const delimiter = document.createElement('span');
    delimiter.className = 'funnel-filter-summary__delimiter';
    delimiter.textContent = ': ';

    const valueLabel = document.createElement('span');
    valueLabel.className = 'funnel-filter-summary__value';
    valueLabel.textContent = thresholdLabel;

    threshold.appendChild(keyLabel);
    threshold.appendChild(delimiter);
    threshold.appendChild(valueLabel);

    row.appendChild(threshold);
    fragment.appendChild(row);
  });
  return fragment;
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
  const content = buildFilterRuleContent(filter);
  if (content.childNodes.length > 0) {
    title.appendChild(content);
  } else {
    title.textContent = formatFilterRuleText(filter);
  }
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

function populateCategories(selectEl, selectedCategory = '') {
  if (!selectEl) return;
  const categories = Array.from(funnelState.keysByCategory.keys());
  selectEl.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    selectEl.appendChild(opt);
  });
  if (selectedCategory && categories.includes(selectedCategory)) {
    selectEl.value = selectedCategory;
  }
  if (!selectEl.value && categories[0]) {
    selectEl.value = categories[0];
  }
}

function populateKeys(categoryName, selectedKeyId = '', selectEl) {
  if (!selectEl) return;
  const keys = funnelState.keysByCategory.get(categoryName) || [];
  selectEl.innerHTML = '';
  let matched = false;
  keys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key.id;
    opt.textContent = key.label;
    if (selectedKeyId && normalizeKey(selectedKeyId) === normalizeKey(key.id)) {
      opt.selected = true;
      matched = true;
    }
    selectEl.appendChild(opt);
  });
  if (selectedKeyId && !matched) {
    const fallback = getKeyDisplay(selectedKeyId);
    const opt = document.createElement('option');
    opt.value = fallback.id;
    opt.textContent = fallback.label;
    opt.selected = true;
    selectEl.appendChild(opt);
  }
  if (!selectEl.value && keys[0]) {
    selectEl.value = keys[0].id;
  }
}

function populateMinimumOptions(keySelect, minSelect, selectedValue = null) {
  if (!minSelect || !keySelect) return;
  const guide = getRatingGuideForKey(keySelect.value);
  const options = guide.length > 0
    ? guide
    : Array.from({ length: 11 }, (_, i) => ({ rating: i, guidance: '' }));
  minSelect.innerHTML = '';

  options.forEach(entry => {
    const opt = document.createElement('option');
    opt.value = String(entry.rating);
    const label = entry.guidance ? `${entry.rating} – ${entry.guidance}` : String(entry.rating);
    opt.textContent = label;
    minSelect.appendChild(opt);
  });

  const numeric = Number(selectedValue);
  if (Number.isFinite(numeric)) {
    const hasOption = options.some(opt => opt.rating === numeric);
    if (!hasOption) {
      const custom = document.createElement('option');
      custom.value = String(numeric);
      custom.textContent = String(numeric);
      minSelect.appendChild(custom);
    }
    minSelect.value = String(numeric);
  } else {
    const defaultValue = options.find(opt => opt.rating === 7)?.rating ?? options[options.length - 1]?.rating;
    if (typeof defaultValue !== 'undefined') {
      minSelect.value = String(defaultValue);
    }
  }
}

function buildConditionRow(condition = {}, index = 0) {
  if (!funnelState.conditionsContainer) return null;
  const row = document.createElement('div');
  row.className = 'funnel-condition';

  const joinWrap = document.createElement('div');
  joinWrap.className = 'funnel-condition__join';
  let joinSelect = null;
  if (index === 0) {
    const label = document.createElement('span');
    label.textContent = 'Where';
    label.className = 'funnel-condition__join-label';
    joinWrap.appendChild(label);
  } else {
    joinSelect = document.createElement('select');
    joinSelect.className = 'funnel-condition__join-select';
    const andOpt = document.createElement('option');
    andOpt.value = 'and';
    andOpt.textContent = 'AND';
    const orOpt = document.createElement('option');
    orOpt.value = 'or';
    orOpt.textContent = 'OR';
    joinSelect.appendChild(andOpt);
    joinSelect.appendChild(orOpt);
    joinSelect.value = condition?.join === 'or' ? 'or' : 'and';
    joinWrap.appendChild(joinSelect);
  }

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'funnel-condition__fields';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'funnel-condition__select';
  const targetMeta = condition?.keyId ? getKeyDisplay(condition.keyId) : null;
  const category = condition?.category || targetMeta?.category;
  populateCategories(categorySelect, category);

  const keySelect = document.createElement('select');
  keySelect.className = 'funnel-condition__select';
  populateKeys(categorySelect.value, condition?.keyId, keySelect);

  const minSelect = document.createElement('select');
  minSelect.className = 'funnel-condition__select';
  populateMinimumOptions(keySelect, minSelect, condition?.minAlignment);

  categorySelect.addEventListener('change', () => {
    populateKeys(categorySelect.value, '', keySelect);
    populateMinimumOptions(keySelect, minSelect);
  });
  keySelect.addEventListener('change', () => populateMinimumOptions(keySelect, minSelect));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'funnel-condition__remove';
  removeBtn.setAttribute('aria-label', 'Remove condition');
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    const existingPayloads = collectConditionPayloads();
    const filtered = existingPayloads.filter((_, idx) => idx !== index);
    buildConditionRows(filtered);
  });

  fieldWrap.appendChild(categorySelect);
  fieldWrap.appendChild(keySelect);
  fieldWrap.appendChild(minSelect);
  fieldWrap.appendChild(removeBtn);

  row.appendChild(joinWrap);
  row.appendChild(fieldWrap);
  funnelState.conditionsContainer.appendChild(row);
  funnelState.conditionRows.push({ row, categorySelect, keySelect, minSelect, joinSelect });
  return row;
}

function buildConditionRows(conditions = []) {
  if (!funnelState.conditionsContainer) return;
  funnelState.conditionsContainer.innerHTML = '';
  funnelState.conditionRows = [];
  const source = conditions.length > 0 ? conditions : [{}];
  source.forEach((condition, idx) => buildConditionRow(condition, idx));
}

function collectConditionPayloads() {
  const payloads = funnelState.conditionRows.map((entry, index) => {
    const keyId = entry.keySelect?.value || '';
    const minAlignment = Number(entry.minSelect?.value);
    const join = index === 0 ? 'and' : (entry.joinSelect?.value === 'or' ? 'or' : 'and');
    const category = entry.categorySelect?.value || '';
    return { keyId, minAlignment, join, category };
  });
  return payloads.filter(item => item.keyId && Number.isFinite(item.minAlignment));
}

function openFilterDialog({ editIndex = null } = {}) {
  if (!funnelState.dialog) return;
  funnelState.currentEditIndex = (typeof editIndex === 'number') ? editIndex : null;
  const isEdit = funnelState.currentEditIndex !== null;
  const existing = isEdit ? funnelState.filters[funnelState.currentEditIndex] : null;
  const conditions = Array.isArray(existing?.conditions) && existing.conditions.length > 0
    ? existing.conditions
    : (existing?.keyId ? [{ keyId: existing.keyId, minAlignment: existing.minAlignment }] : []);
  buildConditionRows(conditions);
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
  buildConditionRows();
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
  const conditions = collectConditionPayloads();
  if (conditions.length === 0) {
    return;
  }
  const payload = { conditions };
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
  let activeSet = new Set(allNodes);
  for (let i = 0; i < funnelState.filters.length; i += 1) {
    const filter = funnelState.filters[i];
    const baseline = Array.from(activeSet);
    const { excluded, included } = await evaluateFilter(baseline, filter);
    activeSet = new Set(included);
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
  const addConditionBtn = document.getElementById('funnelAddConditionBtn');
  if (addConditionBtn) {
    addConditionBtn.addEventListener('click', () => {
      const payloads = collectConditionPayloads();
      payloads.push({ join: 'and' });
      buildConditionRows(payloads);
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
  funnelState.conditionsContainer = document.getElementById('funnelConditions');
  funnelState.mainData = mainData;
  if (!funnelState.rowsContainer || !funnelState.dialog || !funnelState.form) return;

  buildKeyIndex(mainData);
  buildConditionRows();
  funnelState.filters = loadStoredFilters();
  wireDialogControls();
  wireDragAndDrop();
  void renderFunnel();
}

export { initFunnelView };
export default { initFunnelView };
