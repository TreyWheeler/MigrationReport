async function loadMain() {
  const response = await fetch('main.json');
  const mainData = await response.json();
  const select = document.getElementById('countrySelect');
  const notice = document.getElementById('notice');
  // Initialize UI preferences and toggles
  initUiPreferences();

  mainData.Countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.file;
    option.dataset.name = country.name; // keep raw name without flag for logic
    // Set provisional label; update with flag when iso loads
    option.textContent = country.name;
    select.appendChild(option);
    fetchCountry(country.file).then(data => {
      const flag = data && data.iso ? isoToFlagEmoji(String(data.iso)) : '';
      option.dataset.iso = data && data.iso ? String(data.iso) : '';
      option.textContent = flag ? `${flag} ${country.name}` : country.name;
    }).catch(() => {});
  });

  // Multi-select: handle up to 4
  select.addEventListener('change', () => handleSelection(select, mainData, notice));

  // Toolbar toggles
  const diffToggle = document.getElementById('diffToggle');
  const densityToggle = document.getElementById('densityToggle');
  const themeToggle = document.getElementById('themeToggle');
  if (diffToggle) {
    diffToggle.checked = getStored('diffEnabled', false);
    diffToggle.addEventListener('change', () => {
      setStored('diffEnabled', diffToggle.checked);
      handleSelection(select, mainData, notice);
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

  if (mainData.Countries.length > 0) {
    // Default to first country selected
    select.options[0].selected = true;
    handleSelection(select, mainData, notice);
  }
}

// Map score to fixed colors by thresholds: 0-3 red, 4-6 orange, 7 caution yellow, 8-10 forest green
function colorForScore(value) {
  const num = Number(value);
  if (!isFinite(num)) return '#cccccc';
  if (num <= 3) return 'red';
  if (num <= 6) return 'orange';
  if (num === 7) return '#FFCC00'; // caution yellow
  return 'forestgreen';
}

// Cache loaded country JSONs to avoid refetch
const countryCache = new Map();

async function fetchCountry(file) {
  if (countryCache.has(file)) return countryCache.get(file);
  const response = await fetch(file);
  const data = await response.json();
  countryCache.set(file, data);
  return data;
}

function getSelectedOptions(select) {
  return Array.from(select.selectedOptions).map(opt => ({ file: opt.value, name: opt.dataset.name || opt.textContent }));
}

function enforceLimit(select, notice, limit = 3) {
  const selected = getSelectedOptions(select);
  if (selected.length > limit) {
    // Deselect extras beyond limit
    let count = 0;
    for (const opt of Array.from(select.options)) {
      if (opt.selected) {
        if (count < limit) {
          count++;
        } else {
          opt.selected = false;
        }
      }
    }
    notice.textContent = `Limited to ${limit} countries; extras were deselected.`;
  } else {
    notice.textContent = '';
  }
}

async function handleSelection(select, mainData, notice) {
  // Ensure at least one selected and no more than 3
  if (getSelectedOptions(select).length === 0 && select.options.length > 0) {
    select.options[0].selected = true;
  }
  enforceLimit(select, notice, 4);

  const selected = getSelectedOptions(select);
  const files = selected.map(s => s.file);
  if (files.length === 0 && select.options.length > 0) return; // nothing to render yet
  // Always use comparison view, even for a single selection
  await renderComparison(selected, mainData, { diffEnabled: getStored('diffEnabled', false) });
}

async function loadCountry(file, mainData) {
  const response = await fetch(file);
  const countryData = await response.json();
  const reportDiv = document.getElementById('report');
  reportDiv.innerHTML = '';

  mainData.Categories.forEach(category => {
    const catHeader = document.createElement('h2');
    catHeader.textContent = category.Category;
    reportDiv.appendChild(catHeader);

    const ul = document.createElement('ul');
    ul.className = 'score-list';

    category.Keys.forEach(keyObj => {
      const li = document.createElement('li');
      li.className = 'score-item';
      const key = keyObj.Key;
      const match = countryData.values.find(v => v.key === key);
      const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
      const chip = makeScoreChip(hasText ? Number(match.alignmentValue) : null);
      li.appendChild(chip);
      if (match && hasText) {
        li.appendChild(document.createTextNode(`${key}: `));
        appendTextWithLinks(li, match.alignmentText);
      } else {
        li.appendChild(document.createTextNode(`${key}: No data`));
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

  // Legend
  const legend = buildLegend();
  reportDiv.appendChild(legend);

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
    const flag = ds.data && ds.data.iso ? isoToFlagEmoji(String(ds.data.iso)) : '';
    th.textContent = flag ? `${flag} ${ds.name}` : ds.name;
    th.className = 'country-header';
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

  mainData.Categories.forEach(category => {
    // Category header row
    const catRow = document.createElement('tr');
    catRow.className = 'category-header-row';
    const catTh = document.createElement('th');
    catTh.colSpan = 1 + datasets.length;
    catTh.textContent = category.Category;
    catRow.appendChild(catTh);
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
        const match = ds.data.values.find(v => v.key === keyObj.Key);
        const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
        const numeric = hasText ? Number(match.alignmentValue) : NaN;
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

        const chip = makeScoreChip(hasText ? Number(match.alignmentValue) : null);
        wrap.appendChild(chip);
        if (hasText) {
          appendTextWithLinks(wrap, match.alignmentText);
        } else {
          wrap.appendChild(document.createTextNode(contentText));
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
  reportDiv.appendChild(wrap);
  // Column hover highlighting
  let lastCol = -1;
  const clearCol = () => { if (lastCol < 0) return; table.querySelectorAll('.col-hover').forEach(el => el.classList.remove('col-hover')); lastCol = -1; };
  table.addEventListener('mouseleave', clearCol);
  table.addEventListener('mousemove', (e) => {
    const cell = e.target.closest('td,th');
    if (!cell) return;
    const colIndex = cell.cellIndex;
    if (colIndex === lastCol) return;
    table.querySelectorAll('.col-hover').forEach(el => el.classList.remove('col-hover'));
    Array.from(table.tHead.rows).forEach(r => { const c = r.cells[colIndex]; if (c) c.classList.add('col-hover'); });
    Array.from(table.tBodies[0].rows).forEach(r => { const c = r.cells[colIndex]; if (c) c.classList.add('col-hover'); });
    lastCol = colIndex;
  });
}

// Preferences helpers
function getStored(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } }
function setStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function applyTheme(mode) { document.body.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light'); }
function applyDensity(isCompact) { document.body.classList.toggle('density-compact', !!isCompact); }
function initUiPreferences() { /* reserved for future */ }

// Determine score bucket and class/label
function getScoreBucket(score) {
  const num = Number(score);
  if (!isFinite(num) || num <= 0) return { key: 'muted', label: 'No data' };
  if (num <= 3) return { key: 'red', label: '0-3' };
  if (num <= 6) return { key: 'orange', label: '4-6' };
  if (num === 7) return { key: 'yellow', label: '7' };
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
    { score: null, text: 'No data' }
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
    span.textContent = '—';
    span.title = 'No data';
  } else {
    span.textContent = String(n);
    span.title = `Score: ${n} - ${bucket.label}`;
  }
  return span;
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

