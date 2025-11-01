import { appState } from '../state/appState.js';

export function getParentFileForNode(node) {
  if (!node || typeof node !== 'object') return null;
  const parent = node.parentCountry;
  const file = parent && typeof parent.file === 'string' ? parent.file : null;
  return file || null;
}

export function findNodeByFile(file) {
  if (!file) return null;
  const map = appState.nodesByFile;
  if (map && typeof map.get === 'function') {
    if (map.has(file)) return map.get(file);
    if (typeof file === 'string' && !file.includes('/')) {
      const candidate = `reports/${file}`;
      if (map.has(candidate)) return map.get(candidate);
    }
  }
  return null;
}

export function resolveParentReportFile(file, explicitParentFile) {
  if (explicitParentFile) return explicitParentFile;
  const node = findNodeByFile(file);
  return getParentFileForNode(node);
}

export default {
  getParentFileForNode,
  findNodeByFile,
  resolveParentReportFile,
};

