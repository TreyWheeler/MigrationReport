import { appState } from '../state/appState.js';

let hiddenKeysHotkeyAttached = false;

function getStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function setStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function applyTheme(mode) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
}

function applyDensity(isCompact) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('density-compact', !!isCompact);
}

function applyScoresVisibility(show) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('scores-hidden', !show);
}

function applyHiddenKeysVisibility(show) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('show-hidden-keys', !!show);
}

function setHiddenKeysVisibility(show) {
  appState.showHiddenKeys = !!show;
  applyHiddenKeysVisibility(appState.showHiddenKeys);
  setStored('showHiddenKeys', appState.showHiddenKeys);
}

function toggleHiddenKeysVisibility() {
  setHiddenKeysVisibility(!appState.showHiddenKeys);
}

function setupHiddenKeysHotkey() {
  if (hiddenKeysHotkeyAttached || typeof document === 'undefined') return;
  const handler = (event) => {
    if (!event || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key || '';
    if (key.toLowerCase() !== 'h') return;
    const target = event.target;
    if (target) {
      if (typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const tag = (target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
    }
    event.preventDefault();
    toggleHiddenKeysVisibility();
  };
  document.addEventListener('keydown', handler);
  hiddenKeysHotkeyAttached = true;
}

function initUiPreferences() {
  // reserved for future use
}

export {
  getStored,
  setStored,
  applyTheme,
  applyDensity,
  applyScoresVisibility,
  applyHiddenKeysVisibility,
  toggleHiddenKeysVisibility,
  setupHiddenKeysHotkey,
  initUiPreferences,
};
