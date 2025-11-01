import {
  toggleInformationalOverride,
  getInformationalState,
} from '../../data/informationalOverrides.js';

export function makeDigInButton(country, category, categoryKey, cellText) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dig-in-btn';
  btn.textContent = 'Dig In';
  btn.title = 'Open in Perplexity';
  btn.addEventListener('click', (event) => {
    try { event.stopPropagation(); } catch {}
    const text = typeof cellText === 'string' && cellText.length > 0 ? cellText : 'No data';
    const catLabel = `${category} - ${categoryKey}`;
    const query = `I am considering migrating from the United State to ${country}. I am looking at some data describing ${catLabel} in ${country}. Please elaborate on the following text to help me understand what it means: "${text}"`;
    const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;
    try {
      window.open(url, '_blank', 'noopener');
    } catch {
      window.location.href = url;
    }
  });
  return btn;
}

export function makeCompareButton(countries, category, categoryKey) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'compare-btn';
  btn.textContent = 'Compare';
  btn.title = 'Compare countries in Perplexity';
  btn.addEventListener('click', (event) => {
    try { event.stopPropagation(); } catch {}
    const list = Array.isArray(countries) ? countries.filter(Boolean).map(String) : [];
    if (list.length < 2) return;
    const toList = (list.length === 2)
      ? `${list[0]} or ${list[1]}`
      : `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`;
    const inList = (list.length === 2)
      ? `${list[0]} and ${list[1]}`
      : `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
    const catLabel = `${category} - ${categoryKey}`;
    const query = `I am considering migrating from the United States to ${toList}. I am looking at some data describing ${catLabel} in ${inList}. Please explain how these countries differ from the United States and each other.`;
    const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;
    try {
      window.open(url, '_blank', 'noopener');
    } catch {
      window.location.href = url;
    }
  });
  return btn;
}

export function makeInformationalToggleButton(categoryName, keyObj, context = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'info-toggle-btn';

  const applyState = () => {
    const state = getInformationalState(categoryName, keyObj);
    if (state.effective) {
      btn.textContent = 'Include in scoring';
      btn.title = 'Include this key in scoring totals';
    } else {
      btn.textContent = 'Mark informational';
      btn.title = 'Exclude this key from scoring totals';
    }
    btn.classList.toggle('override-active', typeof state.override === 'boolean');
    btn.dataset.state = state.effective ? 'informational' : 'scored';
  };

  applyState();

  btn.addEventListener('click', async (event) => {
    try { event.preventDefault(); event.stopPropagation(); } catch {}
    toggleInformationalOverride(categoryName, keyObj);
    applyState();
    if (typeof context.onToggle === 'function') {
      try {
        await Promise.resolve();
        await context.onToggle();
      } catch {}
    }
  });

  return btn;
}

export default {
  makeDigInButton,
  makeCompareButton,
  makeInformationalToggleButton,
};

