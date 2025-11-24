const countryRawCache = new Map();
const countryResolvedCache = new Map();

function canonicalizeKeyForInheritance(s) {
  try {
    let t = typeof s === 'string' ? s : '';
    if (t.normalize) t = t.normalize('NFKC');
    t = t.replace(/[°�?]/g, '');
    t = t.toLowerCase();
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  } catch {
    return String(s || '');
  }
}

function cloneReportData(data) {
  if (!data || typeof data !== 'object') return { values: [] };
  const clone = { ...data };
  if (Array.isArray(data.values)) {
    clone.values = data.values.map(entry => (entry && typeof entry === 'object') ? { ...entry } : entry);
  } else {
    clone.values = [];
  }
  return clone;
}

function stripSameAsParentFlag(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (!Object.prototype.hasOwnProperty.call(entry, 'sameAsParent')) {
    return { ...entry };
  }
  const { sameAsParent, ...rest } = entry;
  return { ...rest };
}

function mergeReportWithParent(childData, parentData) {
  const parentValues = Array.isArray(parentData && parentData.values) ? parentData.values : [];
  const parentMap = new Map();
  parentValues.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const key = canonicalizeKeyForInheritance(entry.key);
    parentMap.set(key, entry);
  });

  const mergedValues = Array.isArray(childData.values) ? childData.values.map(entry => {
    if (!entry || typeof entry !== 'object') return entry;
    const wantsParent = !!entry.sameAsParent;
    const stripped = stripSameAsParentFlag(entry);
    if (!wantsParent) return stripped;
    const key = canonicalizeKeyForInheritance(entry.key);
    if (!key || !parentMap.has(key)) return stripped;
    const parentEntry = parentMap.get(key);
    const merged = { ...parentEntry, ...stripped };
    const parentHasScore = parentEntry && Object.prototype.hasOwnProperty.call(parentEntry, 'alignmentValue');
    const childOverridesScore = Object.prototype.hasOwnProperty.call(stripped, 'alignmentValue');
    if (parentHasScore && (!childOverridesScore || typeof stripped.alignmentValue === 'undefined')) {
      merged.inheritedFromParent = true;
    }
    return merged;
  }) : [];

  const parentBase = parentData && typeof parentData === 'object' ? { ...parentData } : {};
  const result = { ...parentBase, ...childData };
  result.values = mergedValues;
  return result;
}

async function loadRawCountry(file) {
  if (countryRawCache.has(file)) return countryRawCache.get(file);
  const candidates = [];
  if (typeof file === 'string') {
    candidates.push(file);
    if (!file.includes('/')) candidates.push(`reports/${file}`);
  }

  // Normalize relative paths, then try encoded variants (handles unicode filenames).
  const expandCandidates = (path) => {
    const list = [];
    const normalized = path.startsWith('./') || path.startsWith('/') || path.includes('://')
      ? path
      : `./${path}`;
    list.push(normalized);
    if (!normalized.includes('://')) {
      const encoded = encodeURI(normalized);
      if (encoded !== normalized) list.push(encoded);
    }
    return list;
  };

  let lastErr = null;
  for (const path of candidates.flatMap(expandCandidates)) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const data = await response.json();
      countryRawCache.set(file, data);
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`Failed to fetch country report: ${file}`);
}

async function applyParentInheritance(rawData, file, parentFile, options = {}) {
  const cloned = cloneReportData(rawData);
  const values = Array.isArray(cloned.values) ? cloned.values : [];
  const needsParent = values.some(entry => entry && entry.sameAsParent);
  if (!needsParent) {
    cloned.values = values.map(entry => (entry && typeof entry === 'object') ? stripSameAsParentFlag(entry) : entry);
    return cloned;
  }
  let parentData = null;
  if (parentFile && parentFile !== file) {
    try {
      parentData = await fetchCountry(parentFile, {
        resolveParentFile: options.resolveParentFile,
      });
    } catch {}
  }
  return mergeReportWithParent(cloned, parentData);
}

async function fetchCountry(file, options = {}) {
  const normalizedFile = typeof file === 'string' ? file : String(file || '');
  const parentFile = options.parentFile
    || (typeof options.resolveParentFile === 'function' ? options.resolveParentFile(normalizedFile) : null);
  const cacheKey = parentFile ? `${normalizedFile}||${parentFile}` : normalizedFile;
  if (countryResolvedCache.has(cacheKey)) {
    return countryResolvedCache.get(cacheKey);
  }
  const raw = await loadRawCountry(normalizedFile);
  const resolved = await applyParentInheritance(raw, normalizedFile, parentFile, options);
  countryResolvedCache.set(cacheKey, resolved);
  return resolved;
}

function clearCountryCache() {
  countryRawCache.clear();
  countryResolvedCache.clear();
}

export {
  loadRawCountry,
  fetchCountry,
  clearCountryCache,
};
