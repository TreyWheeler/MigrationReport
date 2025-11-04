import { getStored, setStored } from '../storage/preferences.js';
import { canonicalizeKeySegment } from './informationalOverrides.js';

const STORAGE_KEY = 'keyAlerts';

function getAlertStore() {
  const raw = getStored(STORAGE_KEY, {});
  return (raw && typeof raw === 'object') ? { ...raw } : {};
}

function setAlertStore(store) {
  const safe = (store && typeof store === 'object') ? store : {};
  setStored(STORAGE_KEY, safe);
}

function getAlertStorageKey(categoryName, keyName) {
  const cat = canonicalizeKeySegment(categoryName);
  const key = canonicalizeKeySegment(keyName);
  return `${cat}|||${key}`;
}

function normalizeThresholdValue(value) {
  if (value === null || typeof value === 'undefined') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function sanitizeThresholds(thresholds) {
  const base = (thresholds && typeof thresholds === 'object') ? thresholds : {};
  return {
    concerning: normalizeThresholdValue(base.concerning),
    incompatible: normalizeThresholdValue(base.incompatible),
  };
}

function getKeyAlertLevels(categoryName, keyName) {
  if (!categoryName || !keyName) {
    return { concerning: null, incompatible: null };
  }
  const store = getAlertStore();
  const storageKey = getAlertStorageKey(categoryName, keyName);
  const entry = (store && typeof store[storageKey] === 'object') ? store[storageKey] : null;
  const sanitized = sanitizeThresholds(entry || {});
  return sanitized;
}

function setKeyAlertLevels(categoryName, keyName, thresholds) {
  if (!categoryName || !keyName) return;
  const store = getAlertStore();
  const storageKey = getAlertStorageKey(categoryName, keyName);
  const sanitized = sanitizeThresholds(thresholds);
  if (sanitized.concerning === null && sanitized.incompatible === null) {
    delete store[storageKey];
  } else {
    store[storageKey] = sanitized;
  }
  setAlertStore(store);
}

function evaluateScoreAgainstLevels(score, thresholds) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  const levels = sanitizeThresholds(thresholds);
  const { incompatible, concerning } = levels;
  if (Number.isFinite(incompatible) && numeric <= incompatible) {
    return 'incompatible';
  }
  if (Number.isFinite(concerning) && numeric <= concerning) {
    return 'concerning';
  }
  return null;
}

function evaluateKeyAlert(categoryName, keyName, score) {
  const thresholds = getKeyAlertLevels(categoryName, keyName);
  return evaluateScoreAgainstLevels(score, thresholds);
}

function getAlertLevelsFromRatingGuide(ratingGuide) {
  const levels = new Set();
  if (Array.isArray(ratingGuide)) {
    ratingGuide.forEach(entry => {
      const rating = Number(entry && entry.rating);
      if (Number.isFinite(rating)) {
        levels.add(rating);
      }
    });
  }
  return Array.from(levels).sort((a, b) => a - b);
}

export {
  getKeyAlertLevels,
  setKeyAlertLevels,
  evaluateScoreAgainstLevels,
  evaluateKeyAlert,
  getAlertLevelsFromRatingGuide,
};
