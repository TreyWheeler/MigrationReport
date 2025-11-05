import { appState } from '../state/appState.js';
import { saveSelectedToStorage } from '../storage/selection.js';
import { getStored, setStored } from '../storage/preferences.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics, buildNodeComparator } from '../data/scoring.js';
import { createFlagImg } from '../utils/dom.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';
import { getEffectivePeople } from '../data/weights.js';
import { makeScoreChip } from './components/chips.js';
import { createAlertIcon } from './components/alerts.js';

function updateCollapseCountriesButton(hasExpandable) {
  const collapseBtn = document.getElementById('collapseCountriesBtn');
  if (!collapseBtn) return;
  let canExpand = hasExpandable;
  if (typeof canExpand !== 'boolean') {
    canExpand = Array.isArray(appState.countries) && appState.countries.some(country => Array.isArray(country.cities) && country.cities.length > 0);
  }
  const hideCollapse = !!appState.showCitiesOnly;
  collapseBtn.hidden = hideCollapse;
  collapseBtn.disabled = hideCollapse || !canExpand;
}

function getCurrentSortMode() {
  const sel = document.getElementById('countrySort');
  if (!sel) return 'alpha';
  const value = sel.value;
  return typeof value === 'string' && value ? value : 'alpha';
}

function sortNodesForMode(nodes, mode) {
  const arr = Array.isArray(nodes) ? nodes.slice() : [];
  const comparator = buildNodeComparator(mode);
  arr.sort(comparator);
  return arr;
}

function persistCountryExpandedState(country) {
  if (!country || !country.file) return;
  if (!appState.expandedState || typeof appState.expandedState !== 'object') {
    appState.expandedState = {};
  }
  if (country.expanded) {
    appState.expandedState[country.file] = true;
  } else {
    delete appState.expandedState[country.file];
  }
  setStored('countryExpandedState', appState.expandedState);
}

export function collapseAllCountries() {
  if (appState.showCitiesOnly) return;
  const listEl = document.getElementById('countryList');
  if (!listEl) return;
  const groups = Array.from(listEl.querySelectorAll('.country-group'));
  if (groups.length === 0) return;

  if (!Array.isArray(appState.countries)) return;
  appState.countries.forEach(country => {
    if (!country || !Array.isArray(country.cities) || country.cities.length === 0) return;
    country.expanded = false;
    persistCountryExpandedState(country);
  });

  groups.forEach(group => {
    group.classList.remove('expanded');
    group.classList.add('collapsed');
    const cityList = group.querySelector('.city-list');
    if (cityList) {
      cityList.hidden = true;
      cityList.style.display = 'none';
    }
    const toggle = group.querySelector('.tree-toggle');
    if (toggle) {
      const countryNode = group.querySelector('.country-item-root');
      const countryName = countryNode && countryNode.dataset ? countryNode.dataset.name : '';
      toggle.textContent = '▸';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', countryName ? `Expand ${countryName}` : 'Expand country');
    }
  });
}

function getNodeIso(item) {
  if (!item || !item.file) return '';
  if (item.iso) return String(item.iso);
  const map = appState.nodesByFile;
  if (map && typeof map.get === 'function') {
    const existing = map.get(item.file);
    if (existing && existing.iso) return String(existing.iso);
  }
  return '';
}

function buildTreeNodeChip(item) {
  const sel = document.getElementById('countrySort');
  if (!sel) return null;
  const mode = sel.value || 'alpha';
  if (mode === 'alpha') return null;
  let chip = null;
  if (mode === 'alignment') {
    const v = item.metrics && isFinite(item.metrics.overall) ? item.metrics.overall : null;
    chip = makeScoreChip(isFinite(v) ? v : null, { labelPrefix: 'Alignment score' });
  } else if (mode === 'total') {
    const v = item.metrics && isFinite(item.metrics.allAvg) ? item.metrics.allAvg : null;
    const bucketOverride = { key: 'neutral', label: 'Weighted average' };
    chip = makeScoreChip(isFinite(v) ? v : null, { bucketOverride, labelPrefix: 'Total score' });
  } else if (typeof mode === 'string' && mode.startsWith('person:')) {
    const personName = mode.slice('person:'.length);
    const totals = item.metrics && item.metrics.personTotals ? item.metrics.personTotals : null;
    const score = totals && typeof totals[personName] !== 'undefined' ? Number(totals[personName]) : NaN;
    const labelPrefix = personName ? `${personName} total` : 'Person total';
    chip = makeScoreChip(Number.isFinite(score) ? score : null, { labelPrefix });
  }
  return chip;
}

export function buildTreeRow(item, ctx) {
  const { listEl, notice, onChange } = ctx || {};
  const row = document.createElement('div');
  row.className = 'country-item';
  if (item.type === 'city') {
    row.classList.add('city-item');
  } else {
    row.classList.add('country-item-root');
  }
  row.setAttribute('role', 'option');
  row.dataset.file = item.file;
  row.dataset.name = item.name;
  const isoCode = getNodeIso(item);
  row.dataset.iso = isoCode || '';
  row.dataset.type = item.type || '';

  let chipWrap = null;
  try {
    chipWrap = buildTreeNodeChip(item);
  } catch {}
  if (chipWrap) row.appendChild(chipWrap);

  if (isoCode) {
    const img = createFlagImg(isoCode, 18);
    if (img) row.appendChild(img);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = item.name;
  row.appendChild(nameSpan);

  row.addEventListener('click', () => {
    toggleSelectNode(item, notice);
    updateCountryListSelection(listEl);
    if (typeof onChange === 'function') {
      try {
        const result = onChange();
        if (result && typeof result.then === 'function') {
          result.catch(() => {});
        }
      } catch {}
    }
  });

  return row;
}

export function toggleSelectNode(item, notice) {
  const idx = appState.selected.findIndex(s => s.file === item.file);
  if (idx >= 0) {
    appState.selected.splice(idx, 1);
    if (notice) notice.textContent = '';
  } else {
    if (appState.selected.length >= 3) {
      if (notice) notice.textContent = 'Limited to 3 selections; deselect one to add more.';
      return;
    }
    appState.selected.push(item);
    if (notice) notice.textContent = '';
  }
  saveSelectedToStorage();
}

export function renderCountryList(listEl, countries, notice, onChange) {
  if (!listEl) return;
  const hasExpandable = Array.isArray(countries) && countries.some(country => Array.isArray(country.cities) && country.cities.length > 0);
  updateCollapseCountriesButton(hasExpandable);
  const mode = getCurrentSortMode();
  listEl.innerHTML = '';
  listEl.classList.toggle('cities-only', !!appState.showCitiesOnly);

  if (appState.showCitiesOnly) {
    const allCities = [];
    countries.forEach(country => {
      (country.cities || []).forEach(city => {
        allCities.push(city);
      });
    });
    const sortedCities = sortNodesForMode(allCities, mode);
    sortedCities.forEach(city => {
      const cityRow = buildTreeRow(city, { listEl, notice, onChange });
      cityRow.classList.add('city-node');
      listEl.appendChild(cityRow);
    });
    return;
  }

  countries.forEach(country => {
    const group = document.createElement('div');
    group.className = 'country-group';
    const cityNodes = Array.isArray(country.cities) ? country.cities : [];
    if (cityNodes.length > 0) {
      group.classList.toggle('expanded', !!country.expanded);
      group.classList.toggle('collapsed', !country.expanded);
    }

    const countryRow = buildTreeRow(country, { listEl, notice, onChange });
    countryRow.classList.add('country-node');

    let cityList = null;
    if (cityNodes.length > 0) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tree-toggle';
      if (typeof country.expanded !== 'boolean') {
        country.expanded = false;
      }

      const updateToggle = () => {
        toggle.textContent = country.expanded ? '▾' : '▸';
        toggle.setAttribute('aria-label', `${country.expanded ? 'Collapse' : 'Expand'} ${country.name}`);
        toggle.setAttribute('aria-expanded', country.expanded ? 'true' : 'false');
      };
      updateToggle();
      toggle.addEventListener('click', ev => {
        ev.stopPropagation();
        country.expanded = !country.expanded;
        group.classList.toggle('expanded', country.expanded);
        group.classList.toggle('collapsed', !country.expanded);
        if (cityList) {
          cityList.hidden = !country.expanded;
          cityList.style.display = country.expanded ? 'flex' : 'none';
        }
        updateToggle();
        persistCountryExpandedState(country);
      });
      countryRow.prepend(toggle);
    }

    group.appendChild(countryRow);

    if (cityNodes.length > 0) {
      const citySortMode = appState.showCitiesOnly ? mode : 'alpha';
      const sortedCities = sortNodesForMode(cityNodes, citySortMode);
      cityList = document.createElement('div');
      cityList.className = 'city-list';
      cityList.hidden = !country.expanded;
      cityList.style.display = country.expanded ? 'flex' : 'none';
      sortedCities.forEach(city => {
        const cityRow = buildTreeRow(city, { listEl, notice, onChange });
        cityRow.classList.add('city-node');
        cityList.appendChild(cityRow);
      });
      group.appendChild(cityList);
    }

    listEl.appendChild(group);
  });
}

export function updateCountryListSelection(listEl) {
  if (!listEl) return;
  const rows = Array.from(listEl.querySelectorAll('.country-item'));
  rows.forEach(row => {
    const file = row.dataset.file;
    const selected = appState.selected.some(s => s.file === file);
    row.classList.toggle('selected', selected);
  });
  applySidebarAlerts();
}

async function ensureReportMetrics(item, mainData) {
  if (item.metrics) return item.metrics;
  const data = await fetchCountry(item.file, {
    parentFile: getParentFileForNode(item),
    resolveParentFile: resolveParentReportFile,
  });
  if (data && data.iso && !item.iso) item.iso = String(data.iso);
  const metrics = computeRoundedMetrics(data, mainData, getEffectivePeople(mainData));
  item.metrics = metrics;
  return metrics;
}

function normalizeAlertsMap(alerts) {
  if (!alerts) return new Map();
  if (alerts instanceof Map) return alerts;
  if (typeof alerts !== 'object') return new Map();
  const map = new Map();
  Object.entries(alerts).forEach(([key, value]) => {
    map.set(key, value);
  });
  return map;
}

export function applySidebarAlerts(alerts = appState.reportAlerts) {
  const listEl = document.getElementById('countryList');
  if (!listEl) return;
  const alertsMap = normalizeAlertsMap(alerts);
  const rows = Array.from(listEl.querySelectorAll('.country-item'));
  rows.forEach(row => {
    const existingIcons = Array.from(row.querySelectorAll('.alert-icon[data-alert-icon="true"]'));
    existingIcons.forEach(icon => icon.remove());
    if (!row.classList.contains('selected')) return;
    const file = row.dataset.file || '';
    if (!file) return;
    const entry = alertsMap.get(file);
    if (!entry || !entry.status) return;
    const reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
    const tooltip = reasons.length > 0
      ? reasons.join('\n')
      : `Flagged as ${entry.status}`;
    const srText = row.dataset.name
      ? `${row.dataset.name} alert: ${entry.status}`
      : `Alert: ${entry.status}`;
    const icon = createAlertIcon(entry.status, tooltip, { variant: 'sidebar', srText });
    row.appendChild(icon);
  });
}

export async function applyCountrySort(mainData, listEl, notice, onChange) {
  const sel = document.getElementById('countrySort');
  if (!sel) return;
  const mode = sel.value || 'alpha';
  const items = appState.countries.slice();
  if (mode !== 'alpha') {
    try {
      await Promise.all(items.map(it => ensureReportMetrics(it, mainData)));
      const cityPromises = [];
      items.forEach(country => {
        (country.cities || []).forEach(city => {
          cityPromises.push(ensureReportMetrics(city, mainData));
        });
      });
      if (cityPromises.length > 0) {
        await Promise.all(cityPromises);
      }
    } catch {}
  }

  const comparator = buildNodeComparator(mode);
  items.sort(comparator);
  appState.countries = items;
  const changeHandler = typeof onChange === 'function' ? onChange : () => {};
  renderCountryList(listEl, appState.countries, notice, changeHandler);
  updateCountryListSelection(listEl);
}

export {
  updateCollapseCountriesButton,
};

export default {
  renderCountryList,
  buildTreeRow,
  toggleSelectNode,
  collapseAllCountries,
  updateCountryListSelection,
  applyCountrySort,
  updateCollapseCountriesButton,
};

