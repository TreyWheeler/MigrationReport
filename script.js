async function loadMain() {
  const response = await fetch('main.json');
  const mainData = await response.json();
  const select = document.getElementById('countrySelect');
  const notice = document.getElementById('notice');

  mainData.Countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.file;
    option.textContent = country.name;
    select.appendChild(option);
  });

  // Multi-select: handle up to 4
  select.addEventListener('change', () => handleSelection(select, mainData, notice));

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
  return Array.from(select.selectedOptions).map(opt => ({ file: opt.value, name: opt.textContent }));
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
  await renderComparison(selected, mainData);
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
      const dot = document.createElement('span');
      dot.className = 'score-dot';
      const key = keyObj.Key;
      const match = countryData.values.find(v => v.key === key);
      const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
      if (match && hasText) {
        const score = Number(match.alignmentValue);
        dot.style.backgroundColor = colorForScore(score);
        li.appendChild(dot);
        li.appendChild(document.createTextNode(`${key}: ${match.alignmentText} (Score: ${match.alignmentValue})`));
      } else {
        dot.style.backgroundColor = '#cccccc';
        li.appendChild(dot);
        li.appendChild(document.createTextNode(`${key}: No data`));
      }
      ul.appendChild(li);
    });

    reportDiv.appendChild(ul);
  });
}

loadMain();

// Render a comparison table for up to 3 selected countries
async function renderComparison(selectedList, mainData) {
  const reportDiv = document.getElementById('report');
  reportDiv.innerHTML = '';

  // Fetch all selected countries (with caching)
  const datasets = await Promise.all(selectedList.map(async s => ({
    name: s.name,
    file: s.file,
    data: await fetchCountry(s.file)
  })));

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
    th.textContent = ds.name;
    th.className = 'country-header';
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
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

      datasets.forEach(ds => {
        const td = document.createElement('td');
        td.className = 'value-cell';

        const match = ds.data.values.find(v => v.key === keyObj.Key);
        const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;

        const wrap = document.createElement('div');
        wrap.className = 'cell-inner';
        const dot = document.createElement('span');
        dot.className = 'score-dot';
        let contentText = 'No data';

        if (hasText) {
          const score = Number(match.alignmentValue);
          dot.style.backgroundColor = colorForScore(score);
          contentText = `${match.alignmentText} (Score: ${match.alignmentValue})`;
        } else {
          dot.style.backgroundColor = '#cccccc';
        }

        wrap.appendChild(dot);
        wrap.appendChild(document.createTextNode(contentText));
        td.appendChild(wrap);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);

  // Wrap in scroll container to enable sticky headers/column
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);
  reportDiv.appendChild(wrap);
}

