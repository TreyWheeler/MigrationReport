const appState = { items: [], selected: [] };

function saveSelectedToStorage() {
  try {
    const files = appState.selected.map(s => s.file);
    setStored('selectedCountries', files);
  } catch {}
}

function loadSelectedFromStorage(items) {
  const saved = getStored('selectedCountries', null);
  if (!Array.isArray(saved) || saved.length === 0) return [];
  const byFile = new Map(items.map(it => [it.file, it]));
  const result = [];
  saved.forEach(f => { if (byFile.has(f) && result.length < 4) result.push(byFile.get(f)); });
  return result;
}

async function loadMain() {
  const response = await fetch('main.json');
  const mainData = await response.json();
  const listEl = document.getElementById('countryList');
  const notice = document.getElementById('notice');
  // Initialize UI preferences and toggles
  initUiPreferences();

  // Build items for custom list (sorted by name)
  appState.items = mainData.Countries
    .map(c => ({ name: c.name, file: c.file, iso: '' }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Setup sort dropdown (adds person options and reads stored preference)
  try { setupCountrySortControls(mainData, listEl, notice); } catch {}

  // Initial render: apply stored sort if not alphabetical; otherwise render alphabetically
  try {
    const s = document.getElementById('countrySort');
    if (s && s.value && s.value !== 'alpha') {
      await applyCountrySort(mainData, listEl, notice);
    } else {
      renderCountryList(listEl, appState.items, notice, () => onSelectionChanged(mainData, notice));
    }
  } catch {
    renderCountryList(listEl, appState.items, notice, () => onSelectionChanged(mainData, notice));
  }
  // Restore previously selected countries or default to first
  const restored = loadSelectedFromStorage(appState.items);
  if (restored.length > 0) {
    appState.selected = restored;
  } else if (appState.items.length > 0) {
    appState.selected = [appState.items[0]];
  }
  updateCountryListSelection(listEl);
  onSelectionChanged(mainData, notice);
  // Enrich with ISO in the background and refresh flags
  try {
    await Promise.all(appState.items.map(async it => {
      try { const data = await fetchCountry(it.file); if (data && data.iso) it.iso = String(data.iso); } catch {}
    }));
    renderCountryList(listEl, appState.items, notice, () => onSelectionChanged(mainData, notice));
    updateCountryListSelection(listEl);
  } catch {}

  // Toolbar toggles
  const diffToggle = document.getElementById('diffToggle');
  const densityToggle = document.getElementById('densityToggle');
  const themeToggle = document.getElementById('themeToggle');
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

async function ensureCountryMetrics(item, mainData) {
  if (item.metrics) return item.metrics;
  const data = await fetchCountry(item.file);
  if (data && data.iso && !item.iso) item.iso = String(data.iso);
  const m = computeCountryScoresForSorting(data, mainData, getEffectivePeople(mainData));
  // Normalize to 1 decimal to match chips
  const round1 = (x) => isFinite(x) ? Number(x.toFixed(1)) : NaN;
  const metrics = {
    overall: round1(m.overall),
    allAvg: round1(m.allAvg),
    personTotals: {}
  };
  Object.keys(m.personTotals || {}).forEach(name => { metrics.personTotals[name] = round1(m.personTotals[name]); });
  item.metrics = metrics;
  return metrics;
}

async function applyCountrySort(mainData, listEl, notice) {
  const sel = document.getElementById('countrySort');
  if (!sel) return;
  const mode = sel.value || 'alpha';
  const items = appState.items.slice();

  function byName(a,b){ return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }); }
  function descNum(a,b){ return (b - a); }

  if (mode === 'alpha') {
    items.sort(byName);
    appState.items = items;
    renderCountryList(listEl, appState.items, notice, () => onSelectionChanged(mainData, notice));
    updateCountryListSelection(listEl);
    return;
  }

  // For numeric sorts, compute metrics first
  try {
    await Promise.all(items.map(it => ensureCountryMetrics(it, mainData)));
  } catch {}

  if (mode === 'alignment') {
    items.sort((a,b) => {
      const av = (a.metrics && isFinite(a.metrics.overall)) ? a.metrics.overall : -Infinity;
      const bv = (b.metrics && isFinite(b.metrics.overall)) ? b.metrics.overall : -Infinity;
      if (av === bv) return byName(a,b);
      return descNum(av, bv);
    });
  } else if (mode === 'total') {
    items.sort((a,b) => {
      const av = (a.metrics && isFinite(a.metrics.allAvg)) ? a.metrics.allAvg : -Infinity;
      const bv = (b.metrics && isFinite(b.metrics.allAvg)) ? b.metrics.allAvg : -Infinity;
      if (av === bv) return byName(a,b);
      return descNum(av, bv);
    });
  } else if (mode.startsWith('person:')) {
    const personName = mode.slice('person:'.length);
    items.sort((a,b) => {
      const av = (a.metrics && a.metrics.personTotals && isFinite(a.metrics.personTotals[personName])) ? a.metrics.personTotals[personName] : -Infinity;
      const bv = (b.metrics && b.metrics.personTotals && isFinite(b.metrics.personTotals[personName])) ? b.metrics.personTotals[personName] : -Infinity;
      if (av === bv) return byName(a,b);
      return descNum(av, bv);
    });
  }

  appState.items = items;
  renderCountryList(listEl, appState.items, notice, () => onSelectionChanged(mainData, notice));
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
  if (!selected || selected.length === 0) return;
  // Preserve current table scroll if present
  const reportDiv = document.getElementById('report');
  const oldWrap = reportDiv ? reportDiv.querySelector('.table-wrap') : null;
  const restoreScroll = oldWrap ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop } : getStored('tableScroll', { x: 0, y: 0 });
  renderComparison(selected, mainData, { diffEnabled: getStored('diffEnabled', false), restoreScroll });
}

function renderCountryList(listEl, items, notice, onChange) {
  if (!listEl) return;
  listEl.innerHTML = '';
  items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'country-item';
    row.setAttribute('role', 'option');
    row.dataset.file = it.file;
    row.dataset.name = it.name;
    row.dataset.iso = it.iso || '';
    if (it.iso) {
      const img = createFlagImg(it.iso, 18);
      if (img) row.appendChild(img);
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = it.name;
    row.appendChild(nameSpan);

    // Optional right-aligned chip depending on current sort mode
    try {
      const chipWrap = buildCountryListChip(it);
      if (chipWrap) row.appendChild(chipWrap);
    } catch {}

    row.addEventListener('click', () => {
      toggleSelectCountry(it, notice);
      updateCountryListSelection(listEl);
      onChange && onChange();
    });

    listEl.appendChild(row);
  });
}

function buildCountryListChip(item) {
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
  Array.from(listEl.children).forEach(child => {
    if (!(child instanceof HTMLElement)) return;
    const isSel = selectedFiles.has(child.dataset.file);
    child.classList.toggle('selected', isSel);
    child.setAttribute('aria-selected', isSel ? 'true' : 'false');
  });
}

function toggleSelectCountry(item, notice) {
  const idx = appState.selected.findIndex(s => s.file === item.file);
  if (idx >= 0) {
    appState.selected.splice(idx, 1);
    notice.textContent = '';
  } else {
    if (appState.selected.length >= 4) {
      notice.textContent = 'Limited to 4 countries; deselect one to add more.';
      return;
    }
    appState.selected.push(item);
    notice.textContent = '';
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

loadMain();

// Render a comparison table for up to 3 selected countries
async function renderComparison(selectedList, mainData, options = {}) {
  const reportDiv = document.getElementById('report');
  reportDiv.innerHTML = '';

  // Fetch all selected countries (with caching)
  const datasets = await Promise.all(selectedList.map(async s => ({
    name: s.name,
    file: s.file,
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

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const thLeft = document.createElement('th');
  thLeft.textContent = 'Category / Key';
  thLeft.className = 'country-header';
  headRow.appendChild(thLeft);
  datasets.forEach(ds => {
    const th = document.createElement('th');
    th.className = 'country-header';
    const wrap = document.createElement('span');
    if (ds.data && ds.data.iso) {
      const img = createFlagImg(ds.data.iso, 18);
      if (img) wrap.appendChild(img);
    }
    wrap.appendChild(document.createTextNode(ds.name));
    th.appendChild(wrap);
    headRow.appendChild(th);
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
    const headerCells = Array.from(headRow.cells || []);
    // headerCells[0] is the left key header; countries start at index 1
    datasets.forEach((ds, idx) => {
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
      const th = headerCells[idx + 1];
      if (th) {
        th.appendChild(document.createTextNode(' '));
        th.appendChild(makeScoreChip(isFinite(overall) ? overall : null));
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
                th.appendChild(document.createTextNode(' '));
                th.appendChild(makePersonScoreChip(person.name, total));
                totals.push(sum);
              }
            });
            if (totals.length > 0) {
              const allAvg = Number((totals.reduce((a,b)=>a+b,0) / totals.length).toFixed(1));
              th.appendChild(document.createTextNode(' '));
              th.appendChild(makePersonScoreChip('All', allAvg));
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
    catNameTh.textContent = category.Category;
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

    // Key rows
    category.Keys.forEach(keyObj => {
      const tr = document.createElement('tr');
      const keyTd = document.createElement('td');
      keyTd.className = 'key-cell';
      keyTd.textContent = keyObj.Key;
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
        if (hasText) {
          appendTextWithLinks(wrap, match.alignmentText);
        } else {
          const label = (match && info.numeric === -1) ? 'Unknown' : 'No data';
          wrap.appendChild(document.createTextNode(label));
        }
        td.appendChild(wrap);
        if (options.diffEnabled && counts.size > 1 && info.bucketKey !== majorityKey) {
          td.classList.add('diff-cell');
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);

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
  try { (appState.items || []).forEach(it => { if (it) delete it.metrics; }); } catch {}
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

