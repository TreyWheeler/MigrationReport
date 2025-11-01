import { appState } from '../state/appState.js';
import { getStored, setStored } from '../storage/preferences.js';

export function getWeightsOverrides() {
  const obj = getStored('personWeightsOverrides', {});
  return (obj && typeof obj === 'object') ? obj : {};
}

export function setWeightsOverrides(obj) {
  setStored('personWeightsOverrides', obj && typeof obj === 'object' ? obj : {});
}

export function getEffectivePeople(mainData) {
  try {
    const overrides = getWeightsOverrides();
    const people = Array.isArray(mainData.People) ? mainData.People : [];
    return people.map(p => {
      const ov = overrides && overrides[p.name] ? overrides[p.name] : {};
      const w = Object.create(null);
      (mainData.Categories || []).forEach(cat => {
        const key = cat.Category;
        const v = (ov && typeof ov[key] !== 'undefined')
          ? Number(ov[key])
          : Number((p.weights || {})[key]);
        w[key] = isFinite(v) ? v : NaN;
      });
      return { name: p.name, weights: w };
    });
  } catch {
    return Array.isArray(mainData.People) ? mainData.People : [];
  }
}

export function invalidateCountryMetricsCache() {
  try {
    (appState.countries || []).forEach(country => {
      if (country) {
        delete country.metrics;
        (country.cities || []).forEach(city => { if (city) delete city.metrics; });
      }
    });
  } catch {}
}

export default {
  getWeightsOverrides,
  setWeightsOverrides,
  getEffectivePeople,
  invalidateCountryMetricsCache,
};

