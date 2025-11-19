function canonKey(str) {
  try {
    let text = typeof str === 'string' ? str : '';
    if (text.normalize) text = text.normalize('NFKC');
    text = text.replace(/[°�?]/g, '');
    text = text.toLowerCase();
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  } catch {
    return String(str || '');
  }
}

function formatThresholdValue(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function buildAlertReason(categoryName, keyName, severity, score, threshold) {
  const scoreDisplay = formatThresholdValue(score);
  const thresholdDisplay = formatThresholdValue(threshold);
  const parts = [];
  if (categoryName) parts.push(categoryName);
  if (keyName) parts.push(keyName);
  const prefix = parts.length > 0 ? parts.join(' — ') : 'Alert';
  return `${prefix}: score ${scoreDisplay} ≤ ${severity} threshold (${thresholdDisplay})`;
}

function buildAlertTooltip(severity, score, threshold) {
  const scoreDisplay = formatThresholdValue(score);
  const thresholdDisplay = formatThresholdValue(threshold);
  return `Flagged as ${severity} — score ${scoreDisplay} is at or below the ${severity} threshold (${thresholdDisplay}).`;
}

export {
  canonKey,
  formatThresholdValue,
  buildAlertReason,
  buildAlertTooltip,
};
