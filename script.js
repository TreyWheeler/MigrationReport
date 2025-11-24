import { appState } from './src/state/appState.js';
import { saveSelectedToStorage, loadSelectedFromStorage } from './src/storage/selection.js';
import {
  getStored,
  setStored,
  applyTheme,
  applyDensity,
  applyScoresVisibility,
  applyHiddenKeysVisibility,
  toggleHiddenKeysVisibility,
  setupHiddenKeysHotkey,
  initUiPreferences,
} from './src/storage/preferences.js';
import { fetchJsonAsset, loadMain as loadMainData, sortByOrderThenName } from './src/data/api.js';
import { ensureKeyGuidanceLoaded, makeKeyGuidanceIndex } from './src/data/guidance.js';
import { isInformationalKey } from './src/data/informationalOverrides.js';
import { fetchCountry, clearCountryCache } from './src/data/reports.js';
import { computeCountryScoresForSorting, computeRoundedMetrics } from './src/data/scoring.js';
import { getParentFileForNode, findNodeByFile, resolveParentReportFile } from './src/utils/nodes.js';
import { renderEmptyReportState, renderComparison, onSelectionChanged, refreshAllReportAlerts } from './src/ui/reportTable.js';
import {
  renderCountryList,
  toggleSelectNode,
  collapseAllCountries,
  expandAllCountries,
  toggleCollapseExpandCountries,
  updateCountryListSelection,
  applyCountrySort,
  updateCollapseCountriesButton,
  applySidebarAlerts,
} from './src/ui/sidebar.js';
import { initFunnelView } from './src/ui/funnelView.js';
import { initMapView } from './src/ui/mapView.js';
import { openKeyGuidanceDialog, makeKeyGuidanceButton, openWeightsDialog, afterWeightsChanged } from './src/ui/dialogs/index.js';
import { getEffectivePeople } from './src/data/weights.js';
import { makeScoreChip, makePersonScoreChip, makeInformationalPlaceholderChip } from './src/ui/components/chips.js';
import { appendTextWithLinks } from './src/utils/dom.js';
import { showLoadingIndicator, hideLoadingIndicator, showLoadingError } from './src/ui/loadingIndicator.js';
import { setActiveView, setupViewTabs } from './src/ui/viewTabs.js';

function syncHeaderHeightVar() {
  if (typeof document === 'undefined') return;
  const header = document.querySelector('.app-header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  const height = Math.ceil(rect.height || 0);
  if (Number.isFinite(height) && height > 0) {
    document.documentElement.style.setProperty('--header-height', `${height}px`);
  }
}

async function loadMain() {
  showLoadingIndicator();
  try {
    syncHeaderHeightVar();
    window.addEventListener('resize', syncHeaderHeightVar, { passive: true });
    setupViewTabs();
    const { mainData, ratingGuides } = await loadMainData();
    appState.mainData = mainData;
    appState.reportAlerts = new Map();
    const initialGuidance = makeKeyGuidanceIndex(mainData, ratingGuides);
    appState.keyGuidanceIndex = initialGuidance.index;
    appState.keyGuidanceHasRatings = initialGuidance.hasRatings;
    const ensuredGuidance = await ensureKeyGuidanceLoaded(mainData, {
      currentIndex: appState.keyGuidanceIndex,
      hasRatings: appState.keyGuidanceHasRatings,
      fetchGuides: () => fetchJsonAsset('data/rating_guides.json'),
    });
    appState.keyGuidanceIndex = ensuredGuidance.index;
    appState.keyGuidanceHasRatings = ensuredGuidance.hasRatings;
    const listEl = document.getElementById('countryList');
    const notice = document.getElementById('notice');
    const collapseCountriesBtn = document.getElementById('collapseCountriesBtn');

    // Initialize UI preferences and toggles
    initUiPreferences();

    const storedExpandedRaw = getStored('countryExpandedState', {});
    const expandedState = (storedExpandedRaw && typeof storedExpandedRaw === 'object') ? storedExpandedRaw : {};
    appState.expandedState = { ...expandedState };
    appState.showCitiesOnly = !!getStored('showCitiesOnly', false);
    appState.showHiddenKeys = !!getStored('showHiddenKeys', false);
    applyHiddenKeysVisibility(appState.showHiddenKeys);
    setupHiddenKeysHotkey();
    const storedFocusRaw = getStored('focusedCategory', null);
    const focusList = Array.isArray(storedFocusRaw)
      ? storedFocusRaw
      : ((typeof storedFocusRaw === 'string' && storedFocusRaw.trim()) ? [storedFocusRaw] : []);
    appState.focusedCategories = focusList
      .map(name => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean);
    const citiesOnlyToggle = document.getElementById('citiesOnlyToggle');
    if (citiesOnlyToggle) {
      citiesOnlyToggle.checked = appState.showCitiesOnly;
    }
    if (collapseCountriesBtn) {
      collapseCountriesBtn.addEventListener('click', () => toggleCollapseExpandCountries());
    }
    updateCollapseCountriesButton();

    const countries = Array.isArray(mainData.Countries) ? mainData.Countries.map(c => {
      const country = {
        id: c.id,
        name: c.name,
        file: c.file,
        iso: '',
        type: 'country',
        expanded: false,
        cities: [],
      };
      const cityList = Array.isArray(c.cities) ? c.cities : [];
      country.cities = cityList.map(city => ({
        id: city.id,
        countryId: city.countryId,
        name: city.name,
        file: city.file,
        iso: '',
        type: 'city',
        parentCountry: country,
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      if (country.file && Object.prototype.hasOwnProperty.call(appState.expandedState, country.file)) {
        country.expanded = !!appState.expandedState[country.file];
      }
      return country;
    }) : [];

    countries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    appState.countries = countries;
    appState.nodesByFile = new Map();
    countries.forEach(country => {
      appState.nodesByFile.set(country.file, country);
      (country.cities || []).forEach(city => {
        appState.nodesByFile.set(city.file, city);
      });
    });

    // Sidebar alert filter setup
    const allowedAlertFilters = new Set(['all', 'hide-none', 'hide-warnings', 'hide-incompatible']);
    const storedAlertFilter = getStored('sidebarAlertFilter', 'all');
    const initialAlertFilter = allowedAlertFilters.has(storedAlertFilter) ? storedAlertFilter : 'all';
    appState.sidebarAlertFilter = initialAlertFilter;
    const alertFilterSelect = document.getElementById('alertFilter');
    if (alertFilterSelect) {
      alertFilterSelect.value = initialAlertFilter;
      alertFilterSelect.addEventListener('change', () => {
        const next = allowedAlertFilters.has(alertFilterSelect.value)
          ? alertFilterSelect.value
          : 'all';
        appState.sidebarAlertFilter = next;
        setStored('sidebarAlertFilter', next);
        applySidebarAlerts(appState.reportAlerts, next);
      });
    }

    // Setup sort dropdown (adds person options and reads stored preference)
    try { setupCountrySortControls(mainData, listEl, notice); } catch {}
    try { setupCitiesOnlyToggle(mainData, listEl, notice); } catch {}

    // Initial render: apply stored sort if not alphabetical; otherwise render alphabetically
    try {
      const s = document.getElementById('countrySort');
      if (s && s.value && s.value !== 'alpha') {
        await applyCountrySort(mainData, listEl, notice, () => onSelectionChanged(mainData, notice));
      } else {
        renderCountryList(listEl, appState.countries, notice, () => { void onSelectionChanged(mainData, notice); });
      }
    } catch {
      renderCountryList(listEl, appState.countries, notice, () => { void onSelectionChanged(mainData, notice); });
    }

    try {
      await refreshAllReportAlerts(mainData);
    } catch {}

    // Restore previously selected countries or default to first
    const restored = loadSelectedFromStorage(appState.nodesByFile);
    if (restored.length > 0) {
      appState.selected = restored;
    } else if (appState.countries.length > 0) {
      appState.selected = [appState.countries[0]];
    }
    updateCountryListSelection(listEl);
    await onSelectionChanged(mainData, notice);

    // The data fetch & initial render above dominate startup time, so hide the overlay once complete.
    hideLoadingIndicator();

    // Enrich with ISO in the background and refresh flags without blocking first paint.
    enrichCountryNodes(mainData, listEl, notice);
    initFunnelView(mainData);
    void initMapView(mainData);

    // Toolbar toggles
    const diffToggle = document.getElementById('diffToggle');
    const densityToggle = document.getElementById('densityToggle');
    const themeToggle = document.getElementById('themeToggle');
    const scoresToggle = document.getElementById('scoresToggle');
    const weightsBtn = document.getElementById('weightsBtn');
    if (diffToggle) {
      diffToggle.checked = getStored('diffEnabled', false);
      diffToggle.addEventListener('change', () => {
        setStored('diffEnabled', diffToggle.checked);
        void onSelectionChanged(mainData, notice);
      });
    }
    if (densityToggle) {
      densityToggle.checked = getStored('densityCompact', false);
      applyDensity(densityToggle.checked);
      densityToggle.addEventListener('change', () => {
        setStored('densityCompact', densityToggle.checked);
        applyDensity(densityToggle.checked);
      });
    }
    if (themeToggle) {
      const preferredDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const storedTheme = getStored('theme', null);
      const darkInitial = storedTheme ? storedTheme === 'dark' : preferredDark;
      themeToggle.checked = darkInitial;
      applyTheme(darkInitial ? 'dark' : 'light');
      themeToggle.addEventListener('change', () => {
        const mode = themeToggle.checked ? 'dark' : 'light';
        setStored('theme', mode);
        applyTheme(mode);
      });
    }

    if (scoresToggle) {
      const show = getStored('showScores', true);
      scoresToggle.checked = !!show;
      applyScoresVisibility(!!show);
      scoresToggle.addEventListener('change', () => {
        setStored('showScores', scoresToggle.checked);
        applyScoresVisibility(scoresToggle.checked);
      });
    }

    // Weights dialog
    if (weightsBtn) {
      weightsBtn.addEventListener('click', () => openWeightsDialog(mainData));
    }
  } catch (error) {
    showLoadingError();
    throw error;
  }
}

async function enrichCountryNodes(mainData, listEl, notice) {
  if (!Array.isArray(appState.countries) || appState.countries.length === 0) {
    return;
  }
  try {
    const allNodes = [];
    appState.countries.forEach(country => {
      allNodes.push(country);
      (country.cities || []).forEach(city => allNodes.push(city));
    });
    await Promise.all(allNodes.map(async node => {
      try {
        const data = await fetchCountry(node.file, {
          parentFile: getParentFileForNode(node),
          resolveParentFile: resolveParentReportFile,
        });
        if (data && data.iso && !node.iso) node.iso = String(data.iso);
        if (!node.metrics) {
          node.metrics = computeRoundedMetrics(data, mainData, getEffectivePeople(mainData));
        }
      } catch (err) {
        console.warn('Failed to enrich node data', node?.file, err);
      }
    }));
    renderCountryList(listEl, appState.countries, notice, () => { void onSelectionChanged(mainData, notice); });
    updateCountryListSelection(listEl);
  } catch (error) {
    console.warn('Failed to refresh enriched country data', error);
  }
}

// Build and wire the sort dropdown in the sidebar
function setupCountrySortControls(mainData, listEl, notice) {
  const sel = document.getElementById('countrySort');
  if (!sel) return;
  // Append person options
  if (Array.isArray(mainData.People)) {
    mainData.People.forEach(p => {
      if (!p || !p.name) return;
      const opt = document.createElement('option');
      opt.value = `person:${p.name}`;
      opt.textContent = `Person: ${p.name}`;
      sel.appendChild(opt);
    });
  }
  // Restore stored choice or default
  const stored = getStored('countrySort', 'alpha');
  if (typeof stored === 'string') sel.value = stored;
  sel.addEventListener('change', () => {
    setStored('countrySort', sel.value);
    applyCountrySort(mainData, listEl, notice, () => onSelectionChanged(mainData, notice));
  });
}

function setupCitiesOnlyToggle(mainData, listEl, notice) {
  const toggle = document.getElementById('citiesOnlyToggle');
  if (!toggle) return;
  toggle.checked = !!appState.showCitiesOnly;
  updateCollapseCountriesButton();
  toggle.addEventListener('change', () => {
    appState.showCitiesOnly = toggle.checked;
    setStored('showCitiesOnly', appState.showCitiesOnly);
    updateCollapseCountriesButton();
    renderCountryList(listEl, appState.countries, notice, () => { void onSelectionChanged(mainData, notice); });
    updateCountryListSelection(listEl);
  });
}

async function loadCountry(file, mainData) {
  const node = findNodeByFile(file);
  const countryData = await fetchCountry(file, {
    parentFile: getParentFileForNode(node),
    resolveParentFile: resolveParentReportFile,
  });
  const reportDiv = document.getElementById('report');
  reportDiv.innerHTML = '';

  // Normalize key strings to avoid Unicode-degree/encoding mismatches in lookups
  const canonKey = (s) => {
    try {
      let t = typeof s === 'string' ? s : '';
      if (t.normalize) t = t.normalize('NFKC');
      // Remove degree-like or replacement chars sometimes seen as '°', '�', or '?' before C/F
      t = t.replace(/[°�?]/g, '');
      t = t.toLowerCase();
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    } catch { return String(s || ''); }
  };

  mainData.Categories.forEach(category => {
    const catHeader = document.createElement('h2');
    // Compute average score for this category (ignore <=0, non-numeric, and informational keys)
    const nums = [];
    category.Keys.forEach(keyObj => {
      if (isInformationalKey(keyObj, category.Category)) return;
      const match = countryData.values.find(v => canonKey(v.key) === canonKey(keyObj.Key));
      const n = match ? Number(match.alignmentValue) : NaN;
      if (isFinite(n) && n > 0) nums.push(n);
    });
    const avg = nums.length > 0 ? (nums.reduce((a,b)=>a+b,0) / nums.length) : NaN;
    // Header text + average chip
    const headerLabel = document.createElement('span');
    headerLabel.textContent = category.Category + ' ';
    catHeader.appendChild(headerLabel);
    const avgNum = isFinite(avg) ? Number(avg.toFixed(1)) : NaN;
    catHeader.appendChild(makeScoreChip(isFinite(avgNum) ? avgNum : null));
    // Person-adjusted chips: [Name]: [Score] where Score = CategoryAvg * Weight
    try {
      const peopleEff = getEffectivePeople(mainData);
      if (Array.isArray(peopleEff) && isFinite(avgNum)) {
        const peopleWrap = document.createElement('span');
        peopleWrap.style.marginLeft = '8px';
        peopleEff.forEach(person => {
          const w = person && person.weights ? Number(person.weights[category.Category]) : NaN;
          if (!isFinite(w)) return;
          const adjusted = Number((avgNum * w).toFixed(1));
          peopleWrap.appendChild(document.createTextNode(' '));
          peopleWrap.appendChild(makePersonScoreChip(person.name, adjusted));
        });
        catHeader.appendChild(peopleWrap);
      }
    } catch {}
    reportDiv.appendChild(catHeader);

    const ul = document.createElement('ul');
    ul.className = 'score-list';

    category.Keys.forEach(keyObj => {
      const li = document.createElement('li');
      li.className = 'score-item';
      if (keyObj.Hidden) li.classList.add('hidden-key');
      const key = keyObj.Key;
      const match = countryData.values.find(v => canonKey(v.key) === canonKey(key));
      const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
      const numeric = match ? Number(match.alignmentValue) : NaN;
      const informational = isInformationalKey(keyObj, category.Category);
      const chip = informational ? makeInformationalPlaceholderChip() : makeScoreChip(match ? numeric : null);
      li.appendChild(chip);
      if (informational) li.classList.add('informational-key');
      const textWrap = document.createElement('span');
      textWrap.className = 'score-text';
      if (match && hasText) {
        textWrap.appendChild(document.createTextNode(`${key}: `));
        appendTextWithLinks(textWrap, match.alignmentText);
      } else {
        const label = (match && Number(match.alignmentValue) === -1) ? 'Unknown' : 'No data';
        textWrap.textContent = `${key}: ${label}`;
      }
      li.appendChild(textWrap);
      try {
        const guideBtn = makeKeyGuidanceButton(category.Category, keyObj);
        if (guideBtn) li.appendChild(guideBtn);
      } catch {}
      ul.appendChild(li);
    });

    reportDiv.appendChild(ul);
  });
}

// selection preview removed

const MigrationReportAPI = {
  appState,
  renderEmptyReportState,
  saveSelectedToStorage,
  loadSelectedFromStorage,
  updateCollapseCountriesButton,
  fetchJsonAsset,
  sortByOrderThenName,
  loadMain,
  renderComparison,
  initFunnelView,
  initMapView,
  refreshAllReportAlerts,
  getStored,
  setStored,
  fetchCountry,
  clearCountryCache,
  computeRoundedMetrics,
  computeCountryScoresForSorting,
  applyHiddenKeysVisibility,
  toggleHiddenKeysVisibility,
  collapseAllCountries,
  expandAllCountries,
  toggleCollapseExpandCountries,
  openKeyGuidanceDialog,
};

if (typeof window !== 'undefined') {
  window.MigrationReport = MigrationReportAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MigrationReportAPI;
}

export default MigrationReportAPI;

