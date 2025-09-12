async function loadMain() {
  const response = await fetch('main.json');
  const mainData = await response.json();
  const select = document.getElementById('countrySelect');

  mainData.Countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.file;
    option.textContent = country.name;
    select.appendChild(option);
  });

  select.addEventListener('change', () => loadCountry(select.value, mainData));

  if (mainData.Countries.length > 0) {
    select.value = mainData.Countries[0].file;
    loadCountry(mainData.Countries[0].file, mainData);
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

