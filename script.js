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

    category.Keys.forEach(keyObj => {
      const li = document.createElement('li');
      const key = keyObj.Key;
      const match = countryData.values.find(v => v.key === key);
      if (match) {
        li.textContent = `${key}: ${match.alignmentText} (Score: ${match.alignmentValue})`;
      } else {
        li.textContent = `${key}: No data`;
      }
      ul.appendChild(li);
    });

    reportDiv.appendChild(ul);
  });
}

loadMain();

