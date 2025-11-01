import { appState } from '../state/appState.js';
import { getStored, setStored } from './preferences.js';

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

export { saveSelectedToStorage, loadSelectedFromStorage };
