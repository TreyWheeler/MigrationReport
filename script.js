const appState = { countries: [], selected: [], nodesByFile: new Map(), showCitiesOnly: false, expandedState: {} };

function renderEmptyReportState() {
  const reportDiv = document.getElementById('report');
  if (!reportDiv) return;
  reportDiv.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'empty-state__icon';
  iconWrap.innerHTML = `
    <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="12" y="10" width="40" height="50" rx="6" ry="6"></rect>
        <path d="M24 8h16l2 6H22l2-6z"></path>
        <line x1="20" y1="26" x2="44" y2="26"></line>
        <line x1="20" y1="36" x2="44" y2="36"></line>
        <line x1="20" y1="46" x2="36" y2="46"></line>
      </g>
    </svg>
  `;
  wrap.appendChild(iconWrap);

  const heading = document.createElement('h2');
  heading.textContent = 'Nothing selected yet';
  wrap.appendChild(heading);

  const message = document.createElement('p');
  message.textContent = 'Select up to three countries or cities from the list to build a migration comparison report.';
  wrap.appendChild(message);

  const hint = document.createElement('p');
  hint.className = 'empty-state__hint';
  hint.textContent = 'Tip: tap a location again to remove it and make space for another.';
  wrap.appendChild(hint);

  reportDiv.appendChild(wrap);
}

function saveSelectedToStorage() {
  try {
    const files = appState.selected.map(s => s.file);
    setStored('selectedCountries', files);
  } catch {}
}

function loadSelectedFromStorage(nodesMap) {
  const saved = getStored('selectedCountries', null);
  if (!Array.isArray(saved) || saved.length === 0) return [];
  const result = [];
  saved.forEach(f => {
    if (!nodesMap || typeof nodesMap.get !== 'function') return;
    if (nodesMap.has(f) && result.length < 3) {
      result.push(nodesMap.get(f));
    }
  });
  return result;
}

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

async function fetchJsonAsset(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function sortByOrderThenName(items, orderKey, nameKey) {
  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a, b) => {
    const aOrder = typeof a?.[orderKey] === 'number' ? a[orderKey] : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b?.[orderKey] === 'number' ? b[orderKey] : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aName = typeof a?.[nameKey] === 'string' ? a[nameKey] : '';
    const bName = typeof b?.[nameKey] === 'string' ? b[nameKey] : '';
    return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
  });
  return arr;
}

async function loadRelationalMain() {
  const [categoriesRaw, keysRaw, countriesRaw, citiesRaw, peopleRaw, weightsRaw] = await Promise.all([
    fetchJsonAsset('data/categories.json'),
    fetchJsonAsset('data/category_keys.json'),
    fetchJsonAsset('data/countries.json'),
    fetchJsonAsset('data/cities.json'),
    fetchJsonAsset('data/people.json'),
    fetchJsonAsset('data/person_weights.json'),
  ]);

  const categories = sortByOrderThenName(categoriesRaw?.categories, 'order', 'name');
  const keys = Array.isArray(keysRaw?.categoryKeys) ? keysRaw.categoryKeys.slice() : [];
  const keysByCategory = new Map();
  keys.forEach(key => {
    if (!key || !key.categoryId) return;
    if (!keysByCategory.has(key.categoryId)) keysByCategory.set(key.categoryId, []);
    keysByCategory.get(key.categoryId).push(key);
  });
  const categoriesResult = categories.map(cat => ({
    Category: cat.name,
    Keys: (keysByCategory.get(cat.id) || []).map(key => ({
      Key: key.name,
      Guidance: key.guidance,
    })),
  }));

  const cities = Array.isArray(citiesRaw?.cities) ? citiesRaw.cities.slice() : [];
  const citiesByCountry = new Map();
  cities.forEach(city => {
    if (!city || !city.countryId) return;
    if (!citiesByCountry.has(city.countryId)) citiesByCountry.set(city.countryId, []);
    citiesByCountry.get(city.countryId).push(city);
  });

  const countries = Array.isArray(countriesRaw?.countries) ? countriesRaw.countries.slice() : [];
  const countriesResult = countries.map(country => ({
    name: country.name,
    file: country.report,
    cities: (citiesByCountry.get(country.id) || []).map(city => ({
      name: city.name,
      file: city.report,
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  }));

  const categoryNameById = new Map();
  categories.forEach(cat => { categoryNameById.set(cat.id, cat.name); });
  const weights = Array.isArray(weightsRaw?.personWeights) ? weightsRaw.personWeights.slice() : [];
  const weightsByPerson = new Map();
  weights.forEach(entry => {
    if (!entry || !entry.personId) return;
    if (!weightsByPerson.has(entry.personId)) weightsByPerson.set(entry.personId, []);
    weightsByPerson.get(entry.personId).push(entry);
  });

  const people = Array.isArray(peopleRaw?.people) ? peopleRaw.people.slice() : [];
  const peopleResult = people.map(person => {
    const weightEntries = weightsByPerson.get(person.id) || [];
    const weightsObj = {};
    weightEntries.forEach(entry => {
      const catName = categoryNameById.get(entry.categoryId);
      if (!catName) return;
      weightsObj[catName] = entry.weight;
    });
    return { name: person.name, weights: weightsObj };
  });

  return { Categories: categoriesResult, Countries: countriesResult, People: peopleResult };
}

async function loadMain() {
  let mainData = null;
  try {
    mainData = await loadRelationalMain();
  } catch (err) {
    try {
      const response = await fetch('main.json');
      if (!response.ok) {
        throw new Error(`Legacy main.json unavailable: ${response.status} ${response.statusText}`);
      }
      mainData = await response.json();
    } catch (fallbackErr) {
      console.error('Failed to load data files', err, fallbackErr);
      throw err;
    }
  }
  const listEl = document.getElementById('countryList');
  const notice = document.getElementById('notice');
  const collapseCountriesBtn = document.getElementById('collapseCountriesBtn');
  // Initialize UI preferences and toggles
  initUiPreferences();

  const storedExpandedRaw = getStored('countryExpandedState', {});
  const expandedState = (storedExpandedRaw && typeof storedExpandedRaw === 'object') ? storedExpandedRaw : {};
  appState.expandedState = { ...expandedState };
  appState.showCitiesOnly = !!getStored('showCitiesOnly', false);
  const citiesOnlyToggle = document.getElementById('citiesOnlyToggle');
  if (citiesOnlyToggle) {
    citiesOnlyToggle.checked = appState.showCitiesOnly;
  }
  if (collapseCountriesBtn) {
    collapseCountriesBtn.addEventListener('click', () => collapseAllCountries());
  }
  updateCollapseCountriesButton();

  const countries = Array.isArray(mainData.Countries) ? mainData.Countries.map(c => {
    const country = { name: c.name, file: c.file, iso: '', type: 'country', expanded: false, cities: [] };
    const cityList = Array.isArray(c.cities) ? c.cities : [];
    country.cities = cityList.map(city => ({
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

  // Setup sort dropdown (adds person options and reads stored preference)
  try { setupCountrySortControls(mainData, listEl, notice); } catch {}
  try { setupCitiesOnlyToggle(mainData, listEl, notice); } catch {}

  // Initial render: apply stored sort if not alphabetical; otherwise render alphabetically
  try {
    const s = document.getElementById('countrySort');
    if (s && s.value && s.value !== 'alpha') {
      await applyCountrySort(mainData, listEl, notice);
    } else {
      renderCountryList(listEl, appState.countries, notice, () => onSelectionChanged(mainData, notice));
    }
  } catch {
    renderCountryList(listEl, appState.countries, notice, () => onSelectionChanged(mainData, notice));
  }
  // Restore previously selected countries or default to first
  const restored = loadSelectedFromStorage(appState.nodesByFile);
  if (restored.length > 0) {
    appState.selected = restored;
  } else if (appState.countries.length > 0) {
    appState.selected = [appState.countries[0]];
  }
  updateCountryListSelection(listEl);
  onSelectionChanged(mainData, notice);
  // Enrich with ISO in the background and refresh flags
  try {
    const allNodes = [];
    appState.countries.forEach(country => {
      allNodes.push(country);
      (country.cities || []).forEach(city => allNodes.push(city));
    });
    await Promise.all(allNodes.map(async node => {
      try {
        const data = await fetchCountry(node.file);
        if (data && data.iso && !node.iso) node.iso = String(data.iso);
        if (!node.metrics) {
          node.metrics = computeRoundedMetrics(data, mainData);
        }
      } catch {}
    }));
    renderCountryList(listEl, appState.countries, notice, () => onSelectionChanged(mainData, notice));
    updateCountryListSelection(listEl);
  } catch {}

  // Toolbar toggles
  const diffToggle = document.getElementById('diffToggle');
  const densityToggle = document.getElementById('densityToggle');
  const themeToggle = document.getElementById('themeToggle');
  const scoresToggle = document.getElementById('scoresToggle');
  const weightsBtn = document.getElementById('weightsBtn');
  if (diffToggle) {
    diffToggle.checked = getStored('diffEnabled', false);
    diffToggle.addEventListener('change', () => { setStored('diffEnabled', diffToggle.checked); onSelectionChanged(mainData, notice); });
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
    applyCountrySort(mainData, listEl, notice);
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
    renderCountryList(listEl, appState.countries, notice, () => onSelectionChanged(mainData, notice));
    updateCountryListSelection(listEl);
  });
}

// Compute scores used for sorting for a given country's data
function computeCountryScoresForSorting(countryData, mainData, peopleList) {
  const canonKey = (s) => {
    try {
      let t = typeof s === 'string' ? s : '';
      if (t.normalize) t = t.normalize('NFKC');
      t = t.replace(/[�??]/g, '');
      t = t.toLowerCase();
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    } catch { return String(s || ''); }
  };
  // Per-category averages
  const catAverages = [];
  mainData.Categories.forEach(cat => {
    const vals = [];
    cat.Keys.forEach(k => {
      const m = countryData.values.find(v => canonKey(v.key) === canonKey(k.Key));
      const n = m ? Number(m.alignmentValue) : NaN;
      if (isFinite(n) && n > 0) vals.push(n);
    });
    if (vals.length > 0) {
      const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
      if (isFinite(avg)) catAverages.push(avg);
    }
  });
  const overall = catAverages.length > 0 ? (catAverages.reduce((a,b)=>a+b,0) / catAverages.length) : NaN;

  const personTotals = {};
  const totalsArr = [];
  if (Array.isArray(peopleList)) {
    peopleList.forEach(person => {
      if (!person || !person.weights) return;
      let sum = 0; let any = false;
      mainData.Categories.forEach(cat => {
        const w = Number(person.weights[cat.Category]);
        if (!isFinite(w)) return;
        const vals = [];
        cat.Keys.forEach(k => {
          const m = countryData.values.find(v => canonKey(v.key) === canonKey(k.Key));
          const n = m ? Number(m.alignmentValue) : NaN;
          if (isFinite(n) && n > 0) vals.push(n);
        });
        if (vals.length > 0) {
          const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
          if (isFinite(avg)) { sum += (avg * w); any = true; }
        }
      });
      if (any) { personTotals[person.name] = sum; totalsArr.push(sum); }
    });
  }
  const allAvg = totalsArr.length > 0 ? (totalsArr.reduce((a,b)=>a+b,0) / totalsArr.length) : NaN;
  return { overall, personTotals, allAvg };
}

function computeRoundedMetrics(countryData, mainData) {
  const m = computeCountryScoresForSorting(countryData, mainData, getEffectivePeople(mainData));
  const round1 = (x) => isFinite(x) ? Number(x.toFixed(1)) : NaN;
  const metrics = {
    overall: round1(m.overall),
    allAvg: round1(m.allAvg),
    personTotals: {},
  };
  Object.keys(m.personTotals || {}).forEach(name => { metrics.personTotals[name] = round1(m.personTotals[name]); });
  return metrics;
}

async function ensureReportMetrics(item, mainData) {
  if (item.metrics) return item.metrics;
  const data = await fetchCountry(item.file);
  if (data && data.iso && !item.iso) item.iso = String(data.iso);
  const metrics = computeRoundedMetrics(data, mainData);
  item.metrics = metrics;
  return metrics;
}

async function applyCountrySort(mainData, listEl, notice) {
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
  renderCountryList(listEl, appState.countries, notice, () => onSelectionChanged(mainData, notice));
  updateCountryListSelection(listEl);
}

// Map score to fixed colors by thresholds using rounded integer: 0-3 red, 4-6 orange, 7 caution yellow, 8-10 green
function colorForScore(value) {
  const num = Number(value);
  if (!isFinite(num)) return '#cccccc';
  const rounded = Math.round(num);
  if (rounded <= 3) return 'red';
  if (rounded <= 6) return 'orange';
  if (rounded === 7) return '#FFCC00'; // caution yellow
  return 'forestgreen';
}

// Cache loaded country JSONs to avoid refetch
const countryCache = new Map();

async function fetchCountry(file) {
  if (countryCache.has(file)) return countryCache.get(file);
  const candidates = [];
  if (typeof file === 'string') {
    candidates.push(file);
    if (!file.includes('/')) candidates.push(`reports/${file}`);
  }
  let lastErr = null;
  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const data = await response.json();
      countryCache.set(file, data);
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`Failed to fetch country report: ${file}`);
}

function onSelectionChanged(mainData, notice) {
  const selected = appState.selected;
  if (!selected || selected.length === 0) {
    const legendMount = document.getElementById('legendMount');
    if (legendMount) legendMount.innerHTML = '';
    renderEmptyReportState();
    return;
  }
  // Preserve current table scroll if present
  const reportDiv = document.getElementById('report');
  const oldWrap = reportDiv ? reportDiv.querySelector('.table-wrap') : null;
  const restoreScroll = oldWrap ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop } : getStored('tableScroll', { x: 0, y: 0 });
  renderComparison(selected, mainData, { diffEnabled: getStored('diffEnabled', false), restoreScroll });
}

function getCurrentSortMode() {
  const sel = document.getElementById('countrySort');
  if (!sel) return 'alpha';
  const value = sel.value;
  return typeof value === 'string' && value ? value : 'alpha';
}

function compareByNameThenParent(a, b) {
  const normalize = (val) => (typeof val === 'string') ? val : (val == null ? '' : String(val));
  const nameA = normalize(a && a.name);
  const nameB = normalize(b && b.name);
  const primary = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  if (primary !== 0) return primary;
  const parentA = normalize(a && a.parentCountry && a.parentCountry.name);
  const parentB = normalize(b && b.parentCountry && b.parentCountry.name);
  return parentA.localeCompare(parentB, undefined, { sensitivity: 'base' });
}

function getNodeSortValue(item, mode, personName) {
  if (!item || mode === 'alpha') return Number.NEGATIVE_INFINITY;
  const metrics = item.metrics || {};
  let raw = null;
  if (mode === 'alignment') {
    raw = metrics.overall;
  } else if (mode === 'total') {
    raw = metrics.allAvg;
  } else if (personName) {
    raw = metrics.personTotals ? metrics.personTotals[personName] : undefined;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY;
}

function buildNodeComparator(mode) {
  const personName = (typeof mode === 'string' && mode.startsWith('person:')) ? mode.slice('person:'.length) : null;
  if (mode === 'alpha') {
    return (a, b) => compareByNameThenParent(a, b);
  }
  return (a, b) => {
    const valA = getNodeSortValue(a, mode, personName);
    const valB = getNodeSortValue(b, mode, personName);
    if (valA === valB) return compareByNameThenParent(a, b);
    return valB - valA;
  };
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

function collapseAllCountries() {
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

function renderCountryList(listEl, countries, notice, onChange) {
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
      const sortedCities = sortNodesForMode(cityNodes, mode);
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

function buildTreeNodeChip(item) {
  const sel = document.getElementById('countrySort');
  if (!sel) return null;
  const mode = sel.value || 'alpha';
  if (mode === 'alpha') return null;
  let chip = null;
  if (mode === 'alignment') {
    const v = item.metrics && isFinite(item.metrics.overall) ? item.metrics.overall : null;
    chip = makeScoreChip(isFinite(v) ? v : null);
  } else if (mode === 'total') {
    const v = item.metrics && isFinite(item.metrics.allAvg) ? item.metrics.allAvg : null;
    chip = makePersonScoreChip('All', isFinite(v) ? v : null);
  } else if (mode.startsWith('person:')) {
    const personName = mode.slice('person:'.length);
    const v = (item.metrics && item.metrics.personTotals && isFinite(item.metrics.personTotals[personName])) ? item.metrics.personTotals[personName] : null;
    chip = makePersonScoreChip(personName, isFinite(v) ? v : null);
  }
  if (!chip) return null;
  const wrap = document.createElement('span');
  wrap.className = 'right-chip';
  wrap.appendChild(chip);
  return wrap;
}

function updateCountryListSelection(listEl) {
  const selectedFiles = new Set(appState.selected.map(s => s.file));
  const nodes = listEl.querySelectorAll('[data-file]');
  nodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    const isSel = selectedFiles.has(node.dataset.file);
    node.classList.toggle('selected', isSel);
    node.setAttribute('aria-selected', isSel ? 'true' : 'false');
  });
}

function getNodeIso(item) {
  if (!item) return '';
  const direct = (typeof item.iso === 'string') ? item.iso.trim() : '';
  if (direct) return direct;
  if (item.type === 'city' && item.parentCountry) {
    const parentIsoValue = item.parentCountry.iso;
    if (parentIsoValue == null) return '';
    const str = (typeof parentIsoValue === 'string') ? parentIsoValue : String(parentIsoValue);
    return str.trim();
  }
  return '';
}

function buildTreeRow(item, ctx) {
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

  if (isoCode) {
    const img = createFlagImg(isoCode, 18);
    if (img) row.appendChild(img);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = item.name;
  row.appendChild(nameSpan);

  try {
    const chipWrap = buildTreeNodeChip(item);
    if (chipWrap) row.appendChild(chipWrap);
  } catch {}

  row.addEventListener('click', () => {
    toggleSelectNode(item, notice);
    updateCountryListSelection(listEl);
    onChange && onChange();
  });

  return row;
}

function toggleSelectNode(item, notice) {
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

async function loadCountry(file, mainData) {
  const response = await fetch(file);
  const countryData = await response.json();
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
    // Compute average score for this category (ignore <=0 and non-numeric)
    const nums = [];
    category.Keys.forEach(keyObj => {
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
      const key = keyObj.Key;
      const match = countryData.values.find(v => canonKey(v.key) === canonKey(key));
      const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
      const numeric = match ? Number(match.alignmentValue) : NaN;
      const chip = makeScoreChip(match ? numeric : null);
      li.appendChild(chip);
      if (match && hasText) {
        li.appendChild(document.createTextNode(`${key}: `));
        appendTextWithLinks(li, match.alignmentText);
      } else {
        const label = (match && Number(match.alignmentValue) === -1) ? 'Unknown' : 'No data';
        li.appendChild(document.createTextNode(`${key}: ${label}`));
      }
      ul.appendChild(li);
    });

    reportDiv.appendChild(ul);
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__MIGRATION_REPORT_DISABLE_AUTOLOAD__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadMain();
    });
  } else {
    loadMain();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    appState,
    renderEmptyReportState,
    saveSelectedToStorage,
    loadSelectedFromStorage,
    updateCollapseCountriesButton,
    fetchJsonAsset,
    sortByOrderThenName,
    loadMain,
    getStored,
    setStored,
  };
}

// Render a comparison table for up to 3 selected countries
async function renderComparison(selectedList, mainData, options = {}) {
  const reportDiv = document.getElementById('report');
  reportDiv.innerHTML = '';
  const collapseCategoriesBtn = document.getElementById('collapseCategoriesBtn');
  if (collapseCategoriesBtn) {
    collapseCategoriesBtn.disabled = true;
    collapseCategoriesBtn.onclick = null;
    collapseCategoriesBtn.setAttribute('aria-disabled', 'true');
  }

  // Fetch all selected countries (with caching)
  const datasets = await Promise.all(selectedList.map(async s => ({
    name: s.name,
    file: s.file,
    node: s,
    data: await fetchCountry(s.file)
  })));

  // Legend in header bar
  const legendMount = document.getElementById('legendMount');
  if (legendMount) {
    legendMount.innerHTML = '';
    legendMount.appendChild(buildLegend());
  }

  const table = document.createElement('table');
  table.className = 'comparison-table';

  const handleDeselect = (file) => {
    if (!file) return;
    try {
      const map = appState.nodesByFile;
      if (!map || typeof map.get !== 'function') return;
      const node = map.get(file);
      if (!node) return;
      const noticeEl = document.getElementById('notice');
      toggleSelectNode(node, noticeEl);
      const listEl = document.getElementById('countryList');
      if (listEl) updateCountryListSelection(listEl);
      onSelectionChanged(mainData, noticeEl);
    } catch {}
  };

  const attachRemoveHandlers = (root) => {
    if (!root) return;
    const buttons = root.querySelectorAll('.country-header-remove');
    buttons.forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        handleDeselect(btn.dataset.file || '');
      });
    });
  };

  const headerScoreTargets = [];

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const thLeft = document.createElement('th');
  thLeft.textContent = 'Category / Key';
  thLeft.className = 'country-header';
  headRow.appendChild(thLeft);
  datasets.forEach(ds => {
    const th = document.createElement('th');
    th.className = 'country-header';
    if (ds.file) th.dataset.file = ds.file;
    if (ds.node && ds.node.type) th.dataset.type = ds.node.type;

    const inner = document.createElement('div');
    inner.className = 'country-header-inner';

    const labelWrap = document.createElement('span');
    labelWrap.className = 'country-header-label';
    if (ds.data && ds.data.iso) {
      const img = createFlagImg(ds.data.iso, 18);
      if (img) labelWrap.appendChild(img);
    }
    const nameNode = document.createElement('span');
    nameNode.textContent = ds.name;
    labelWrap.appendChild(nameNode);
    inner.appendChild(labelWrap);

    const scoresWrap = document.createElement('div');
    scoresWrap.className = 'country-header-scores';
    inner.appendChild(scoresWrap);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'country-header-remove';
    removeBtn.title = `Deselect ${ds.name}`;
    removeBtn.setAttribute('aria-label', `Deselect ${ds.name}`);
    removeBtn.dataset.file = ds.file || '';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      handleDeselect(ds.file || '');
    });
    inner.appendChild(removeBtn);

    th.appendChild(inner);
    headRow.appendChild(th);

    headerScoreTargets.push({ container: scoresWrap });
  });
  thead.appendChild(headRow);
  // Colgroup with equal country widths and a fixed key column
  const keyPct = 26; // percent for key column
  const countryPct = (100 - keyPct) / Math.max(1, datasets.length);
  const colgroup = document.createElement('colgroup');
  const colKey = document.createElement('col');
  colKey.style.width = keyPct + '%';
  colgroup.appendChild(colKey);
  datasets.forEach(() => {
    const c = document.createElement('col');
    c.style.width = countryPct + '%';
    colgroup.appendChild(c);
  });
  table.appendChild(colgroup);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Collapsible category support
  const collapsedSet = new Set(getStored('collapsedCategories', []));
  const catSections = [];

  // Normalize key strings to avoid Unicode-degree/encoding mismatches in lookups
  const canonKey = (s) => {
    try {
      let t = typeof s === 'string' ? s : '';
      if (t.normalize) t = t.normalize('NFKC');
      t = t.replace(/[°�?]/g, '');
      t = t.toLowerCase();
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    } catch { return String(s || ''); }
  };

  // Compute and append overall average chip in each country header
  try {
    datasets.forEach((ds, idx) => {
      const target = headerScoreTargets[idx];
      const container = target && target.container ? target.container : null;
      const catAverages = [];
      mainData.Categories.forEach(cat => {
        const vals = [];
        cat.Keys.forEach(k => {
          const m = ds.data.values.find(v => canonKey(v.key) === canonKey(k.Key));
          const n = m ? Number(m.alignmentValue) : NaN;
          if (isFinite(n) && n > 0) vals.push(n);
        });
        if (vals.length > 0) {
          const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
          if (isFinite(avg)) catAverages.push(avg);
        }
      });
      const overall = catAverages.length > 0 ? Number((catAverages.reduce((a,b)=>a+b,0) / catAverages.length).toFixed(1)) : NaN;
      if (container) {
        container.appendChild(makeScoreChip(isFinite(overall) ? overall : null));
        // Also append per-person total scores across categories for this country
        try {
          const peopleEff = getEffectivePeople(mainData);
          if (Array.isArray(peopleEff) && peopleEff.length > 0) {
            const totals = [];
            peopleEff.forEach(person => {
              if (!person || !person.weights) return;
              let sum = 0;
              let any = false;
              mainData.Categories.forEach(cat => {
                const w = Number(person.weights[cat.Category]);
                if (!isFinite(w)) return;
                const vals = [];
                cat.Keys.forEach(k => {
                  const m = ds.data.values.find(v => canonKey(v.key) === canonKey(k.Key));
                  const n = m ? Number(m.alignmentValue) : NaN;
                  if (isFinite(n) && n > 0) vals.push(n);
                });
                if (vals.length > 0) {
                  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
                  if (isFinite(avg)) {
                    sum += (avg * w);
                    any = true;
                  }
                }
              });
              if (any) {
                const total = Number(sum.toFixed(1));
                container.appendChild(makePersonScoreChip(person.name, total));
                totals.push(sum);
              }
            });
            if (totals.length > 0) {
              const allAvg = Number((totals.reduce((a,b)=>a+b,0) / totals.length).toFixed(1));
              container.appendChild(makePersonScoreChip('All', allAvg));
            }
          }
        } catch {}
      }
    });
  } catch {}

  mainData.Categories.forEach(category => {
    // Category header row with per-country averages
    const catRow = document.createElement('tr');
    catRow.className = 'category-header-row';
    const catNameTh = document.createElement('th');
    const catName = category.Category;
    // Build collapse toggle + label
    catNameTh.innerHTML = '';
    const toggle = document.createElement('button');
    toggle.className = 'cat-toggle';
    const initiallyCollapsed = collapsedSet.has(catName);
    toggle.textContent = initiallyCollapsed ? '▸' : '▾';
    toggle.setAttribute('aria-expanded', initiallyCollapsed ? 'false' : 'true');
    toggle.title = initiallyCollapsed ? 'Expand category' : 'Collapse category';
    const catLabelSpan = document.createElement('span');
    catLabelSpan.textContent = catName;
    catNameTh.appendChild(toggle);
    catNameTh.appendChild(catLabelSpan);
    catRow.appendChild(catNameTh);
    // Compute and render per-country average for this category
    datasets.forEach(ds => {
      const values = [];
      category.Keys.forEach(k => {
        const m = ds.data.values.find(v => canonKey(v.key) === canonKey(k.Key));
        const n = m ? Number(m.alignmentValue) : NaN;
        if (isFinite(n) && n > 0) values.push(n);
      });
      const avg = values.length > 0 ? (values.reduce((a,b)=>a+b,0) / values.length) : NaN;
      const th = document.createElement('th');
      const avgNum = isFinite(avg) ? Number(avg.toFixed(1)) : NaN;
      th.appendChild(makeScoreChip(isFinite(avgNum) ? avgNum : null));
      // Append person-adjusted chips per country for this category
      try {
        const peopleEff = getEffectivePeople(mainData);
        if (Array.isArray(peopleEff) && isFinite(avgNum)) {
          peopleEff.forEach(person => {
            const w = person && person.weights ? Number(person.weights[category.Category]) : NaN;
            if (!isFinite(w)) return;
            const adjusted = Number((avgNum * w).toFixed(1));
            th.appendChild(document.createTextNode(' '));
            th.appendChild(makePersonScoreChip(person.name, adjusted));
          });
        }
      } catch {}
      catRow.appendChild(th);
    });
    tbody.appendChild(catRow);

    // Key rows (track refs for collapse)
    const keyRowRefs = [];
    category.Keys.forEach(keyObj => {
      const tr = document.createElement('tr');
      tr.dataset.category = catName;
      const keyTd = document.createElement('td');
      keyTd.className = 'key-cell';
      const keyInner = document.createElement('div');
      keyInner.className = 'key-inner';
      const keyLabel = document.createElement('span');
      keyLabel.textContent = keyObj.Key;
      keyInner.appendChild(keyLabel);
      try {
        if (Array.isArray(selectedList) && selectedList.length > 1) {
          const names = datasets.map(d => d.name).slice(0, 4);
          const btn = makeCompareButton(names, category.Category, keyObj.Key);
          keyInner.appendChild(btn);
        }
      } catch {}
      keyTd.appendChild(keyInner);
      tr.appendChild(keyTd);

      // Precompute per-country values for this key
      const perCountry = datasets.map(ds => {
        const match = ds.data.values.find(v => canonKey(v.key) === canonKey(keyObj.Key));
        const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
        const numeric = match ? Number(match.alignmentValue) : NaN;
        const bucket = getScoreBucket(numeric);
        return { match, hasText, numeric, bucketKey: bucket.key };
      });

      // Majority bucket for difference highlighting
      const counts = new Map();
      perCountry.forEach(pc => counts.set(pc.bucketKey, (counts.get(pc.bucketKey) || 0) + 1));
      let majorityKey = null, majorityCount = -1;
      for (const [k, c] of counts.entries()) { if (c > majorityCount) { majorityKey = k; majorityCount = c; } }

      datasets.forEach((ds, idx) => {
        const td = document.createElement('td');
        td.className = 'value-cell';
        const info = perCountry[idx];
        const match = info.match;
        const hasText = info.hasText;
        const wrap = document.createElement('div');
        wrap.className = 'cell-inner';
        let contentText = 'No data';

        const chip = makeScoreChip(match ? info.numeric : null);
        wrap.appendChild(chip);
        let textForQuery = '';
        if (hasText) {
          appendTextWithLinks(wrap, match.alignmentText);
          textForQuery = String(match.alignmentText || '');
        } else {
          const label = (match && info.numeric === -1) ? 'Unknown' : 'No data';
          wrap.appendChild(document.createTextNode(label));
          textForQuery = label;
        }
        // Add Dig In button (hidden until hover via CSS)
        try {
          const btn = makeDigInButton(ds.name, category.Category, keyObj.Key, textForQuery);
          wrap.appendChild(btn);
        } catch {}
        td.appendChild(wrap);
        if (options.diffEnabled && counts.size > 1 && info.bucketKey !== majorityKey) {
          td.classList.add('diff-cell');
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
      keyRowRefs.push(tr);
    });
    // Track section and apply initial collapsed state
    catSections.push({ name: catName, header: catRow, rows: keyRowRefs, toggle });
    if (initiallyCollapsed) {
      keyRowRefs.forEach(r => { r.style.display = 'none'; });
      catRow.classList.add('collapsed');
    }
    // Toggle click handler
    toggle.addEventListener('click', () => {
      const isCollapsed = catRow.classList.toggle('collapsed');
      toggle.textContent = isCollapsed ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      toggle.title = isCollapsed ? 'Expand category' : 'Collapse category';
      keyRowRefs.forEach(r => { r.style.display = isCollapsed ? 'none' : ''; });
      // Persist
      try {
        const current = new Set(getStored('collapsedCategories', []));
        if (isCollapsed) current.add(catName); else current.delete(catName);
        setStored('collapsedCategories', Array.from(current));
      } catch {}
    });
  });

  table.appendChild(tbody);

  if (collapseCategoriesBtn) {
    if (!catSections.length) {
      collapseCategoriesBtn.disabled = true;
      collapseCategoriesBtn.onclick = null;
      collapseCategoriesBtn.setAttribute('aria-disabled', 'true');
    } else {
      collapseCategoriesBtn.disabled = false;
      collapseCategoriesBtn.removeAttribute('aria-disabled');
      collapseCategoriesBtn.onclick = () => {
        if (!catSections.length) return;
        const collapsedNames = [];
        catSections.forEach(section => {
          if (!section) return;
          if (section.name) collapsedNames.push(section.name);
          if (section.header) {
            section.header.classList.add('collapsed');
          }
          if (Array.isArray(section.rows)) {
            section.rows.forEach(row => { row.style.display = 'none'; });
          }
          if (section.toggle) {
            section.toggle.textContent = '▸';
            section.toggle.setAttribute('aria-expanded', 'false');
            section.toggle.title = 'Expand category';
          }
        });
        const uniqueNames = Array.from(new Set(collapsedNames.filter(Boolean)));
        setStored('collapsedCategories', uniqueNames);
      };
    }
  }

  // Ensure sensible minimum width to avoid initial horizontal scrollbar with one country,
  // while allowing more columns to expand and scroll if needed.
  const keyMin = 240; // px
  const countryMin = 320; // px per country
  table.style.minWidth = (keyMin + datasets.length * countryMin) + 'px';

  // Wrap in scroll container to enable sticky headers/column
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);

  // Floating header overlay (as sibling of wrap for reliable sticky)
  const floating = document.createElement('div');
  floating.className = 'floating-header';
  const frow = document.createElement('div');
  frow.className = 'floating-row';
  floating.appendChild(frow);
  // Insert floating header above the scroll container
  reportDiv.appendChild(floating);
  reportDiv.appendChild(wrap);

  // Restore scroll position (from prior render or stored between sessions)
  try {
    const rs = options && options.restoreScroll ? options.restoreScroll : getStored('tableScroll', { x: 0, y: 0 });
    if (rs && typeof rs.x === 'number' && typeof rs.y === 'number') {
      wrap.scrollLeft = rs.x;
      wrap.scrollTop = rs.y;
    }
  } catch {}

  function buildFloatingFromThead() {
    frow.innerHTML = '';
    const headerRow = table.tHead && table.tHead.rows[0];
    if (!headerRow) return;
    const cells = Array.from(headerRow.cells);
    const widths = cells.map(c => Math.ceil(c.getBoundingClientRect().width));
    frow.style.gridTemplateColumns = widths.map(w => `${w}px`).join(' ');
    cells.forEach(c => {
      const cell = document.createElement('div');
      cell.className = 'fh-cell';
      cell.innerHTML = c.innerHTML;
      frow.appendChild(cell);
    });
    // Match container width to visible scroll area
    floating.style.width = wrap.clientWidth + 'px';
    attachRemoveHandlers(floating);
  }

  function updateFloatingVisibility() {
    try {
      const headerRect = table.tHead.getBoundingClientRect();
      // Show once the real header scrolls above the viewport top
      const show = headerRect.top < 0;
      floating.classList.toggle('visible', show);
      // Keep header horizontally aligned with scrolled content
      frow.style.transform = `translateX(${-wrap.scrollLeft}px)`;
    } catch {}
  }

  buildFloatingFromThead();
  updateFloatingVisibility();
  wrap.addEventListener('scroll', () => {
    updateFloatingVisibility();
    setStored('tableScroll', { x: wrap.scrollLeft, y: wrap.scrollTop });
  });
  window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
  window.addEventListener('resize', buildFloatingFromThead);
}

// Preferences helpers
function getStored(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } }
function setStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function applyTheme(mode) { document.body.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light'); }
function applyDensity(isCompact) { document.body.classList.toggle('density-compact', !!isCompact); }
function applyScoresVisibility(show) { document.body.classList.toggle('scores-hidden', !show); }
function initUiPreferences() { /* reserved for future */ }

// Determine score bucket and class/label using rounded integer for thresholds
function getScoreBucket(score) {
  const num = Number(score);
  if (!isFinite(num) || num <= 0) return { key: 'muted', label: 'No data' };
  const rounded = Math.round(num);
  if (rounded <= 3) return { key: 'red', label: '0-3' };
  if (rounded <= 6) return { key: 'orange', label: '4-6' };
  if (rounded === 7) return { key: 'yellow', label: '7' };
  return { key: 'green', label: '8-10' };
}

function createScoreChip(score) {
  const span = document.createElement('span');
  const bucket = getScoreBucket(score);
  span.className = `score-chip bucket-${bucket.key}`;
  const n = Number(score);
  if (isFinite(Number(score))) {
    span.textContent = String(Number(score));
    span.title = `Score: ${Number(score)} - ${bucket.label}`;
  } else {
    span.textContent = '—';
    span.title = 'No data';
  }
  if (isFinite(n)) {
    // Ensure a clean ASCII title regardless of earlier assignments
    span.title = `Score: ${n} - ${bucket.label}`;
  }
  return span;
}

function buildLegend() {
  const legend = document.createElement('div');
  legend.className = 'legend';
  const items = [
    { score: 2, text: '0-3 (Poor)' },
    { score: 5, text: '4-6 (Mixed)' },
    { score: 7, text: '7 (Caution)' },
    { score: 9, text: '8-10 (Strong)' },
    { score: null, text: 'No Data or Unknown' }
  ];
  items.forEach(it => {
    const wrap = document.createElement('span');
    wrap.className = 'legend-item';
    wrap.appendChild(makeScoreChip(it.score));
    const label = document.createElement('span');
    label.textContent = it.text;
    wrap.appendChild(label);
    legend.appendChild(wrap);
  });
  return legend;
}

// New score chip factory that treats 0 as No data (muted)
function makeScoreChip(score) {
  const span = document.createElement('span');
  const bucket = getScoreBucket(score);
  span.className = `score-chip bucket-${bucket.key}`;
  const n = Number(score);
  if (!isFinite(n) || n <= 0) {
    span.textContent = '-';
    span.title = (n === -1) ? 'Unknown' : 'No data';
  } else {
    span.textContent = String(n);
    span.title = `Score: ${n} - ${bucket.label}`;
  }
  return span;
}

// Chip showing person-adjusted category score with label "Name: score"
function makePersonScoreChip(name, score) {
  const span = document.createElement('span');
  const n = Number(score);
  const bucket = getScoreBucket(n);
  // Person chips use neutral styling regardless of bucket
  span.className = 'score-chip person-chip';
  const labelName = (typeof name === 'string' && name) ? name : 'Person';
  if (!isFinite(n) || n <= 0) {
    span.textContent = `${labelName}: -`;
    span.title = `${labelName}: No data`;
  } else {
    // Show 1 decimal when present, otherwise integer
    const text = (Math.abs(n - Math.round(n)) < 1e-6) ? String(Math.round(n)) : String(n);
    span.textContent = `${labelName}: ${text}`;
    span.title = `${labelName} adjusted: ${n} - ${bucket.label}`;
  }
  return span;
}

// ========== Weights overrides and dialog ==========
function getWeightsOverrides() {
  const obj = getStored('personWeightsOverrides', {});
  return (obj && typeof obj === 'object') ? obj : {};
}

function setWeightsOverrides(obj) {
  setStored('personWeightsOverrides', obj && typeof obj === 'object' ? obj : {});
}

function getEffectivePeople(mainData) {
  try {
    const overrides = getWeightsOverrides();
    const people = Array.isArray(mainData.People) ? mainData.People : [];
    return people.map(p => {
      const ov = overrides && overrides[p.name] ? overrides[p.name] : {};
      const w = Object.create(null);
      // Use categories from main to define stable order
      (mainData.Categories || []).forEach(cat => {
        const key = cat.Category;
        const v = (ov && typeof ov[key] !== 'undefined') ? Number(ov[key]) : Number((p.weights || {})[key]);
        w[key] = isFinite(v) ? v : NaN;
      });
      return { name: p.name, weights: w };
    });
  } catch { return Array.isArray(mainData.People) ? mainData.People : []; }
}

function invalidateCountryMetricsCache() {
  try {
    (appState.countries || []).forEach(country => {
      if (country) {
        delete country.metrics;
        (country.cities || []).forEach(city => { if (city) delete city.metrics; });
      }
    });
  } catch {}
}

function openWeightsDialog(mainData) {
  const dlg = document.getElementById('weightsDialog');
  const body = document.getElementById('weightsDialogBody');
  const btnSave = document.getElementById('weightsSave');
  const btnCancel = document.getElementById('weightsCancel');
  const btnReset = document.getElementById('weightsReset');
  if (!dlg || !body) return;

  // Build content
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
    // Refresh UI using current mainData
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

function afterWeightsChanged(mainData) {
  try {
    // Re-sort and re-render list and table based on updated weights
    const listEl = document.getElementById('countryList');
    const notice = document.getElementById('notice');
    applyCountrySort(mainData, listEl, notice);
    onSelectionChanged(mainData, notice);
  } catch {}
}

function isoToFlagEmoji(iso) {
  if (!iso || iso.length !== 2) return '';
  const A = 0x1F1E6; // Regional Indicator Symbol Letter A
  const chars = iso.toUpperCase().split('').map(c => String.fromCodePoint(A + (c.charCodeAt(0) - 65)));
  return chars.join('');
}

// Append text to parent, converting Markdown links [text](https://...) into <a> tags
function appendTextWithLinks(parent, text) {
  if (typeof text !== 'string' || text.length === 0) {
    return;
  }
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
    }
    const a = document.createElement('a');
    a.href = m[2];
    a.textContent = m[1];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    parent.appendChild(a);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

// Create a "Dig In" button that opens a Perplexity query in a new tab
function makeDigInButton(country, category, categoryKey, cellText) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dig-in-btn';
  btn.textContent = 'Dig In';
  btn.title = 'Open in Perplexity';
  btn.addEventListener('click', (e) => {
    try { e.stopPropagation(); } catch {}
    const text = typeof cellText === 'string' && cellText.length > 0 ? cellText : 'No data';
    const catLabel = `${category} - ${categoryKey}`;
    const q = `I am considering migrating from the United State to ${country}. I am looking at some data describing ${catLabel} in ${country}. Please elaborate on the following text to help me understand what it means: "${text}"`;
    const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`;
    try { window.open(url, '_blank', 'noopener'); } catch { window.location.href = url; }
  });
  return btn;
}

// Create a "Compare" button that opens a Perplexity query comparing two selected countries
function makeCompareButton(countries, category, categoryKey) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'compare-btn';
  btn.textContent = 'Compare';
  btn.title = 'Compare countries in Perplexity';
  btn.addEventListener('click', (e) => {
    try { e.stopPropagation(); } catch {}
    const list = Array.isArray(countries) ? countries.filter(Boolean).map(String) : [];
    if (list.length < 2) return;
    const toList = (list.length === 2) ? `${list[0]} or ${list[1]}` : `${list.slice(0,-1).join(', ')}, or ${list[list.length-1]}`;
    const inList = (list.length === 2) ? `${list[0]} and ${list[1]}` : `${list.slice(0,-1).join(', ')}, and ${list[list.length-1]}`;
    const catLabel = `${category} - ${categoryKey}`;
    const q = `I am considering migrating from the United States to ${toList}. I am looking at some data describing ${catLabel} in ${inList}. Please explain how these countries differ from the United States and each other.`;
    const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`;
    try { window.open(url, '_blank', 'noopener'); } catch { window.location.href = url; }
  });
  return btn;
}

// Create an <img> for a country ISO code using a public flag CDN (SVG)
function createFlagImg(iso, width = 18) {
  if (!iso || typeof iso !== 'string') return null;
  const lower = iso.toLowerCase();
  // FlagCDN SVG endpoint
  const url = `https://flagcdn.com/${lower}.svg`;
  const img = document.createElement('img');
  img.src = url;
  img.alt = `${iso} flag`;
  img.className = 'flag-icon';
  img.width = width;
  img.height = Math.round(width * (2/3));
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

// Update the preview list of selected countries with flags in the sidebar
function updateSelectionPreview(selectEl) {
  const preview = document.getElementById('selectionPreview');
  if (!preview) return;
  preview.innerHTML = '';
  const selected = Array.from(selectEl.selectedOptions);
  selected.forEach(opt => {
    const iso = (opt.dataset && opt.dataset.iso) ? String(opt.dataset.iso) : '';
    const row = document.createElement('div');
    row.className = 'selection-item';
    if (iso) {
      const img = createFlagImg(iso, 18);
      if (img) row.appendChild(img);
    }
    row.appendChild(document.createTextNode(opt.dataset.name || opt.textContent));
    preview.appendChild(row);
  });
}

// selection preview removed

