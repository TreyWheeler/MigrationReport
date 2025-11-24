import { coerceInformationalFlag, normalizeInformationalFlags } from './guidance.js';

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

async function fetchJsonAsset(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadRelationalMain() {
  const [categoriesRaw, keysRaw, countriesRaw, citiesRaw, peopleRaw, weightsRaw, ratingGuidesRaw] = await Promise.all([
    fetchJsonAsset('data/categories.json'),
    fetchJsonAsset('data/category_keys.json'),
    fetchJsonAsset('data/countries.json'),
    fetchJsonAsset('data/cities.json'),
    fetchJsonAsset('data/people.json'),
    fetchJsonAsset('data/person_weights.json'),
    fetchJsonAsset('data/rating_guides.json').catch(() => null),
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
    Keys: sortByOrderThenName(keysByCategory.get(cat.id) || [], 'order', 'label').map(key => ({
      KeyId: key.id,
      Key: typeof key.label === 'string' && key.label.length > 0 ? key.label : key.id,
      Guidance: key.guidance,
      Informational: coerceInformationalFlag(key.informational),
      Hidden: !!key.hidden,
      RatingGuide: key.ratingGuide,
      RatingConsiderations: key.ratingConsiderations,
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
    id: country.id,
    name: country.name,
    file: country.report,
    cities: (citiesByCountry.get(country.id) || []).map(city => ({
      id: city.id,
      countryId: city.countryId,
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

  const result = { Categories: categoriesResult, Countries: countriesResult, People: peopleResult };
  normalizeInformationalFlags(result);
  const ratingGuides = Array.isArray(ratingGuidesRaw?.ratingGuides) ? ratingGuidesRaw.ratingGuides : [];
  return { mainData: result, ratingGuides };
}

async function loadMain() {
  try {
    const relational = await loadRelationalMain();
    return relational;
  } catch (err) {
    try {
      const response = await fetch('main.json');
      if (!response.ok) {
        throw new Error(`Legacy main.json unavailable: ${response.status} ${response.statusText}`);
      }
      const mainData = await response.json();
      normalizeInformationalFlags(mainData);
      return { mainData, ratingGuides: [] };
    } catch (fallbackErr) {
      console.error('Failed to load data files', err, fallbackErr);
      throw err;
    }
  }
}

export {
  fetchJsonAsset,
  loadRelationalMain,
  loadMain,
  sortByOrderThenName,
};
