import { isInformationalKey } from './informationalOverrides.js';
import { appState } from '../state/appState.js';

function canonicalizeKey(value) {
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

function normalizeCategoryName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function computeCountryScoresForSorting(countryData, mainData, peopleList = [], options = {}) {
  const values = Array.isArray(countryData?.values) ? countryData.values : [];
  const canon = (s) => canonicalizeKey(s);
  const categoriesRaw = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  let focusCandidates = [];
  if (Array.isArray(options?.focusCategory)) {
    focusCandidates = options.focusCategory;
  } else if (typeof options?.focusCategory === 'string' && options.focusCategory) {
    focusCandidates = [options.focusCategory];
  } else {
    focusCandidates = appState.focusedCategories;
  }
  const focusNormalized = Array.isArray(focusCandidates)
    ? focusCandidates
        .map(name => normalizeCategoryName(name))
        .filter(name => name && name.length > 0)
    : [];
  const focusSet = new Set(focusNormalized);
  const categories = focusSet.size > 0
    ? categoriesRaw.filter(cat => focusSet.has(normalizeCategoryName(cat?.Category)))
    : categoriesRaw;

  const catAverages = [];
  categories.forEach(cat => {
    const vals = [];
    const keys = Array.isArray(cat?.Keys) ? cat.Keys : [];
    keys.forEach(k => {
      if (isInformationalKey(k, cat.Category)) return;
      const match = values.find(v => canon(v?.key) === canon(k?.Key));
      const n = match ? Number(match.alignmentValue) : NaN;
      if (isFinite(n) && n > 0) vals.push(n);
    });
    if (vals.length > 0) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (isFinite(avg)) catAverages.push(avg);
    }
  });
  const overall = catAverages.length > 0 ? (catAverages.reduce((a, b) => a + b, 0) / catAverages.length) : NaN;

  const personTotals = {};
  const totalsArr = [];
  const effectivePeople = Array.isArray(peopleList) ? peopleList : [];
  effectivePeople.forEach(person => {
    if (!person || !person.weights) return;
    let sum = 0;
    let any = false;
    categories.forEach(cat => {
      const weight = Number(person.weights[cat.Category]);
      if (!isFinite(weight)) return;
      const vals = [];
      const keys = Array.isArray(cat?.Keys) ? cat.Keys : [];
      keys.forEach(k => {
        if (isInformationalKey(k, cat.Category)) return;
        const match = values.find(v => canon(v?.key) === canon(k?.Key));
        const n = match ? Number(match.alignmentValue) : NaN;
        if (isFinite(n) && n > 0) vals.push(n);
      });
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (isFinite(avg)) { sum += (avg * weight); any = true; }
      }
    });
    if (any) {
      personTotals[person.name] = sum;
      totalsArr.push(sum);
    }
  });

  const allAvg = totalsArr.length > 0 ? (totalsArr.reduce((a, b) => a + b, 0) / totalsArr.length) : NaN;
  return { overall, personTotals, allAvg };
}

function computeRoundedMetrics(countryData, mainData, peopleList = []) {
  const scores = computeCountryScoresForSorting(countryData, mainData, peopleList);
  const round1 = (x) => (isFinite(x) ? Number(x.toFixed(1)) : NaN);
  const metrics = {
    overall: round1(scores.overall),
    allAvg: round1(scores.allAvg),
    personTotals: {},
  };
  Object.keys(scores.personTotals || {}).forEach(name => {
    metrics.personTotals[name] = round1(scores.personTotals[name]);
  });
  return metrics;
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

export {
  computeCountryScoresForSorting,
  computeRoundedMetrics,
  buildNodeComparator,
};
