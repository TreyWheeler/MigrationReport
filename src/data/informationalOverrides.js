import { getStored, setStored } from '../storage/preferences.js';

function canonicalizeKeySegment(value) {
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

function getInformationalStorageKey(categoryName, keyName) {
  const cat = canonicalizeKeySegment(categoryName);
  const key = canonicalizeKeySegment(keyName);
  return `${cat}|||${key}`;
}

function getInformationalOverrides() {
  const overrides = getStored('informationalOverrides', {});
  return (overrides && typeof overrides === 'object') ? overrides : {};
}

function setInformationalOverrides(overrides) {
  const safe = (overrides && typeof overrides === 'object') ? overrides : {};
  setStored('informationalOverrides', safe);
}

function getInformationalOverride(categoryName, keyName) {
  if (!categoryName || !keyName) return undefined;
  const overrides = getInformationalOverrides();
  const storageKey = getInformationalStorageKey(categoryName, keyName);
  if (Object.prototype.hasOwnProperty.call(overrides, storageKey)) {
    return !!overrides[storageKey];
  }
  return undefined;
}

function setInformationalOverride(categoryName, keyName, value) {
  if (!categoryName || !keyName) return;
  const overrides = { ...getInformationalOverrides() };
  const storageKey = getInformationalStorageKey(categoryName, keyName);
  if (typeof value === 'boolean') {
    overrides[storageKey] = value;
  } else {
    delete overrides[storageKey];
  }
  setInformationalOverrides(overrides);
}

function toggleInformationalOverride(categoryName, keyObj) {
  if (!categoryName || !keyObj) return;
  const keyName = keyObj.Key;
  const base = !!keyObj.Informational;
  const current = getInformationalOverride(categoryName, keyName);
  const effective = (typeof current === 'boolean') ? current : base;
  const next = !effective;
  if (next === base) {
    setInformationalOverride(categoryName, keyName);
  } else {
    setInformationalOverride(categoryName, keyName, next);
  }
}

function getInformationalState(categoryName, keyObj) {
  const base = !!(keyObj && keyObj.Informational);
  const override = keyObj ? getInformationalOverride(categoryName, keyObj.Key) : undefined;
  const effective = (typeof override === 'boolean') ? override : base;
  return { base, override, effective };
}

function isInformationalKey(keyObj, categoryName) {
  if (!keyObj) return false;
  const override = getInformationalOverride(categoryName, keyObj.Key);
  if (typeof override === 'boolean') return override;
  return !!keyObj.Informational;
}

export {
  canonicalizeKeySegment,
  getInformationalOverrides,
  setInformationalOverrides,
  getInformationalOverride,
  setInformationalOverride,
  toggleInformationalOverride,
  getInformationalState,
  isInformationalKey,
};
