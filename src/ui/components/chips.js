// Chip builders and helpers for score rendering in tables and lists.

export function getScoreBucket(score) {
  const num = Number(score);
  if (!isFinite(num) || num <= 0) return { key: 'muted', label: 'No data' };
  const rounded = Math.round(num);
  if (rounded <= 3) return { key: 'red', label: '0-3' };
  if (rounded <= 6) return { key: 'orange', label: '4-6' };
  if (rounded === 7) return { key: 'yellow', label: '7' };
  return { key: 'green', label: '8-10' };
}

export function makeScoreChip(score) {
  const span = document.createElement('span');
  const bucket = getScoreBucket(score);
  span.className = `score-chip bucket-${bucket.key}`;
  const n = Number(score);
  if (!isFinite(n) || n <= 0) {
    span.textContent = '-';
    span.title = (n === -1) ? 'Unknown' : 'No data';
  } else {
    span.textContent = String(n);
    span.title = `Score: ${n} - ${bucket.label}`;
  }
  return span;
}

export function makeInformationalPlaceholderChip() {
  const span = document.createElement('span');
  span.className = 'score-chip placeholder';
  span.textContent = '–';
  span.setAttribute('aria-hidden', 'true');
  span.title = 'Informational key';
  return span;
}

export function makePersonScoreChip(name, score) {
  const span = document.createElement('span');
  const n = Number(score);
  const bucket = getScoreBucket(n);
  span.className = 'score-chip person-chip';
  const labelName = (typeof name === 'string' && name) ? name : 'Person';
  if (!isFinite(n) || n <= 0) {
    span.textContent = `${labelName}: -`;
    span.title = `${labelName}: No data`;
  } else {
    const text = (Math.abs(n - Math.round(n)) < 1e-6) ? String(Math.round(n)) : String(n);
    span.textContent = `${labelName}: ${text}`;
    span.title = `${labelName} adjusted: ${n} - ${bucket.label}`;
  }
  return span;
}

export default {
  getScoreBucket,
  makeScoreChip,
  makeInformationalPlaceholderChip,
  makePersonScoreChip,
};

