import { appState } from '../state/appState.js';
import { getStored, setStored } from '../storage/preferences.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics } from '../data/scoring.js';
import { getEffectivePeople } from '../data/weights.js';
import { createFlagImg } from '../utils/dom.js';
import { makeScoreChip } from './components/chips.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';

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
  minInput: null,
  mainData: null,
  currentEditIndex: null,
  reportCache: new Map(),
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
      if (!keyId) return null;
      return { keyId, minAlignment: Number.isFinite(minAlignment) ? minAlignment : 0 };
    })
    .filter(Boolean);
}

function persistFilters() {
  setStored(STORAGE_KEY, funnelState.filters);
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
      const label = keyObj?.Key || id;
      const meta = { id, label, category: normalizedCategory };
      funnelState.keyIndex.set(normalizeKey(id), meta);
      list.push(meta);
    });
    funnelState.keysByCategory.set(normalizedCategory, list);
  });
}

function getAllReportNodes() {
  const nodes = [];
  appState.countries.forEach(country => {
    nodes.push(country);
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

function makeReportPill(node) {
  const pill = document.createElement('div');
  pill.className = 'funnel-report-pill';

  const metrics = node?.metrics || {};
  const chip = makeScoreChip(metrics.overall, { labelPrefix: 'Alignment score' });
  chip.classList.add('right-chip');
  pill.appendChild(chip);

  if (node?.iso) {
    const flag = createFlagImg(node.iso, 18);
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

  return pill;
}

function renderReportList(nodes, emptyText) {
  const wrapper = document.createElement('div');
  wrapper.className = 'funnel-report-list';
  if (!nodes || nodes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'funnel-empty';
    empty.textContent = emptyText;
    wrapper.appendChild(empty);
    return wrapper;
  }
  nodes.forEach(node => wrapper.appendChild(makeReportPill(node)));
  return wrapper;
}

function makeFilterSummary(filter, index) {
  const container = document.createElement('div');
  container.className = 'funnel-filter-summary';
  const { label } = getKeyDisplay(filter.keyId);
  const title = document.createElement('div');
  title.className = 'funnel-filter-summary__rule';
  title.textContent = `Filter ${index + 1}: ${label} ≥ ${filter.minAlignment}`;
  container.appendChild(title);
  const hint = document.createElement('p');
  hint.className = 'funnel-cell__muted';
  hint.textContent = 'Remove or edit this filter to change the funnel.';
  container.appendChild(hint);
  return container;
}

function makeFilterRow(filter, index, excluded, included) {
  const row = document.createElement('div');
  row.className = 'funnel-row';

  const adminCell = document.createElement('div');
  adminCell.className = 'funnel-cell';
  adminCell.appendChild(makeFilterSummary(filter, index));

  const actions = document.createElement('div');
  actions.className = 'funnel-filter-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'pill-button';
  editBtn.textContent = 'Edit filter';
  editBtn.addEventListener('click', () => openFilterDialog({ editIndex: index }));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'pill-button';
  removeBtn.textContent = 'Remove filter';
  removeBtn.addEventListener('click', () => {
    funnelState.filters.splice(index, 1);
    persistFilters();
    void renderFunnel();
  });

  actions.appendChild(editBtn);
  actions.appendChild(removeBtn);
  adminCell.appendChild(actions);

  const excludedCell = document.createElement('div');
  excludedCell.className = 'funnel-cell';
  excludedCell.appendChild(renderReportList(excluded, 'No reports excluded by this filter.'));

  const includedCell = document.createElement('div');
  includedCell.className = 'funnel-cell';
  includedCell.appendChild(renderReportList(included, 'No reports remain after this filter.'));

  row.appendChild(adminCell);
  row.appendChild(excludedCell);
  row.appendChild(includedCell);
  return row;
}

function makeAddRow(remaining) {
  const row = document.createElement('div');
  row.className = 'funnel-row';

  const adminCell = document.createElement('div');
  adminCell.className = 'funnel-cell';
  const title = document.createElement('h3');
  title.className = 'funnel-cell__title';
  title.textContent = 'Add a filter';
  adminCell.appendChild(title);
  const hint = document.createElement('p');
  hint.className = 'funnel-cell__muted';
  hint.textContent = 'Filters are additive and remove reports below the specified alignment value.';
  adminCell.appendChild(hint);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'pill-button';
  addBtn.textContent = 'Add filter';
  addBtn.addEventListener('click', () => openFilterDialog({ editIndex: null }));
  adminCell.appendChild(addBtn);

  const excludedCell = document.createElement('div');
  excludedCell.className = 'funnel-cell';
  excludedCell.appendChild(renderReportList([], 'No filters applied in this step.'));

  const includedCell = document.createElement('div');
  includedCell.className = 'funnel-cell';
  includedCell.appendChild(renderReportList(remaining, 'No reports available.'));

  row.appendChild(adminCell);
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
  if (existing) {
    funnelState.minInput.value = existing.minAlignment;
  } else {
    funnelState.minInput.value = '7';
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
  if (!funnelState.keySelect || !funnelState.minInput) return;
  const keyId = funnelState.keySelect.value;
  const minAlignment = Number(funnelState.minInput.value);
  if (!keyId || !Number.isFinite(minAlignment)) {
    return;
  }
  const payload = { keyId, minAlignment };
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
  let remaining = allNodes;
  for (let i = 0; i < funnelState.filters.length; i += 1) {
    const filter = funnelState.filters[i];
    const { excluded, included } = await evaluateFilter(remaining, filter);
    rows.appendChild(makeFilterRow(filter, i, excluded, included));
    remaining = included;
  }
  rows.appendChild(makeAddRow(remaining));
}

function wireDialogControls() {
  if (!funnelState.form) return;
  funnelState.form.addEventListener('submit', handleDialogSubmit);
  if (funnelState.categorySelect) {
    funnelState.categorySelect.addEventListener('change', () => {
      populateKeys(funnelState.categorySelect.value);
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
  funnelState.minInput = document.getElementById('funnelMinInput');
  funnelState.mainData = mainData;
  if (!funnelState.rowsContainer || !funnelState.dialog || !funnelState.form) return;

  buildKeyIndex(mainData);
  populateCategories();
  populateKeys(funnelState.categorySelect.value);
  funnelState.filters = loadStoredFilters();
  wireDialogControls();
  void renderFunnel();
}

export { initFunnelView };
export default { initFunnelView };
