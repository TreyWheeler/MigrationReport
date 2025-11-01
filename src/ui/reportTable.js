import { appState, resetKeyActionsMenuState } from '../state/appState.js';
import { closeKeyActionsMenu, makeKeyActionsMenu } from '../state/keyActionsMenu.js';
import { getStored, setStored } from '../storage/preferences.js';
import { fetchCountry } from '../data/reports.js';
import { makeKeyGuidanceButton } from './dialogs/index.js';
import {
  makeInformationalToggleButton,
  makeCompareButton,
  makeDigInButton,
} from './components/actions.js';
import {
  makeScoreChip,
  makeInformationalPlaceholderChip,
  makePersonScoreChip,
  getScoreBucket,
} from './components/chips.js';
import { appendTextWithLinks, createFlagImg } from '../utils/dom.js';
import { toggleSelectNode, updateCountryListSelection } from './sidebar.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';
import { getEffectivePeople } from '../data/weights.js';
import { isInformationalKey } from '../data/informationalOverrides.js';

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

export function renderEmptyReportState() {
  const reportDiv = document.getElementById('report');
  if (!reportDiv) return;
  reportDiv.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'empty-state__icon';
  iconWrap.innerHTML = `
    <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="12" y="10" width="40" height="50" rx="6" ry="6"></rect>
        <path d="M24 8h16l2 6H22l2-6z"></path>
        <line x1="20" y1="26" x2="44" y2="26"></line>
        <line x1="20" y1="36" x2="44" y2="36"></line>
        <line x1="20" y1="46" x2="36" y2="46"></line>
      </g>
    </svg>
  `;
  wrap.appendChild(iconWrap);

  const heading = document.createElement('h2');
  heading.textContent = 'Nothing selected yet';
  wrap.appendChild(heading);

  const message = document.createElement('p');
  message.textContent = 'Select up to three countries or cities from the list to build a migration comparison report.';
  wrap.appendChild(message);

  const hint = document.createElement('p');
  hint.className = 'empty-state__hint';
  hint.textContent = 'Tip: tap a location again to remove it and make space for another.';
  wrap.appendChild(hint);

  reportDiv.appendChild(wrap);
}

function buildLegend() {
  const legend = document.createElement('div');
  legend.className = 'legend';
  const items = [
    { score: 2, text: '0-3 (Poor)' },
    { score: 5, text: '4-6 (Mixed)' },
    { score: 7, text: '7 (Caution)' },
    { score: 9, text: '8-10 (Strong)' },
    { score: null, text: 'No Data or Unknown' }
  ];
  items.forEach(it => {
    const wrap = document.createElement('span');
    wrap.className = 'legend-item';
    wrap.appendChild(makeScoreChip(it.score));
    const label = document.createElement('span');
    label.textContent = it.text;
    wrap.appendChild(label);
    legend.appendChild(wrap);
  });
  return legend;
}

export async function renderComparison(selectedList, mainData, options = {}) {
  const reportDiv = document.getElementById('report');
  if (!reportDiv) return;
  reportDiv.innerHTML = '';
  closeKeyActionsMenu();
  resetKeyActionsMenuState();
  const collapseCategoriesBtn = document.getElementById('collapseCategoriesBtn');
  if (collapseCategoriesBtn) {
    collapseCategoriesBtn.disabled = true;
    collapseCategoriesBtn.onclick = null;
    collapseCategoriesBtn.setAttribute('aria-disabled', 'true');
  }

  const diffEnabled = !!(options && options.diffEnabled);

  const datasets = await Promise.all(selectedList.map(async s => ({
    name: s.name,
    file: s.file,
    node: s,
    data: await fetchCountry(s.file, {
      parentFile: getParentFileForNode(s),
      resolveParentFile: resolveParentReportFile,
    })
  })));

  const legendMount = document.getElementById('legendMount');
  if (legendMount) {
    legendMount.innerHTML = '';
    legendMount.appendChild(buildLegend());
  }

  const rerender = () => {
    const wrap = reportDiv.querySelector('.table-wrap');
    const restoreScroll = wrap ? { x: wrap.scrollLeft, y: wrap.scrollTop } : undefined;
    const opts = { diffEnabled };
    if (restoreScroll) opts.restoreScroll = restoreScroll;
    renderComparison(Array.isArray(selectedList) ? selectedList : [], mainData, opts);
  };

  const table = document.createElement('table');
  table.className = 'comparison-table';

  const handleDeselect = (file) => {
    if (!file) return;
    try {
      const map = appState.nodesByFile;
      if (!map || typeof map.get !== 'function') return;
      const node = map.get(file);
      if (!node) return;
      const noticeEl = document.getElementById('notice');
      toggleSelectNode(node, noticeEl);
      const listEl = document.getElementById('countryList');
      if (listEl) updateCountryListSelection(listEl);
      onSelectionChanged(mainData, noticeEl);
    } catch {}
  };

  const headerScoreTargets = [];

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const thLeft = document.createElement('th');
  thLeft.textContent = 'Category / Key';
  thLeft.className = 'country-header';
  headRow.appendChild(thLeft);
  datasets.forEach(ds => {
    const th = document.createElement('th');
    th.className = 'country-header';
    if (ds.file) th.dataset.file = ds.file;
    if (ds.node && ds.node.type) th.dataset.type = ds.node.type;

    const inner = document.createElement('div');
    inner.className = 'country-header-inner';

    const labelWrap = document.createElement('span');
    labelWrap.className = 'country-header-label';
    if (ds.data && ds.data.iso) {
      const img = createFlagImg(ds.data.iso, 18);
      if (img) labelWrap.appendChild(img);
    }
    const nameNode = document.createElement('span');
    nameNode.textContent = ds.name;
    labelWrap.appendChild(nameNode);
    inner.appendChild(labelWrap);

    const scoresWrap = document.createElement('div');
    scoresWrap.className = 'country-header-scores';
    inner.appendChild(scoresWrap);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'country-header-remove';
    removeBtn.title = `Deselect ${ds.name}`;
    removeBtn.setAttribute('aria-label', `Deselect ${ds.name}`);
    removeBtn.dataset.file = ds.file || '';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      handleDeselect(ds.file || '');
    });
    inner.appendChild(removeBtn);

    th.appendChild(inner);
    headRow.appendChild(th);

    headerScoreTargets.push({ container: scoresWrap });
  });
  thead.appendChild(headRow);
  const colgroup = document.createElement('colgroup');
  const colKey = document.createElement('col');
  colKey.style.width = '26%';
  colgroup.appendChild(colKey);
  const countryPct = (100 - 26) / Math.max(1, datasets.length);
  datasets.forEach(() => {
    const c = document.createElement('col');
    c.style.width = `${countryPct}%`;
    colgroup.appendChild(c);
  });
  table.appendChild(colgroup);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  const collapsedSet = new Set(getStored('collapsedCategories', []));
  const catSections = [];

  try {
    datasets.forEach((ds, idx) => {
      const target = headerScoreTargets[idx];
      const container = target && target.container ? target.container : null;
      if (!container) return;
      const catAverages = [];
      mainData.Categories.forEach(cat => {
        const vals = [];
        cat.Keys.forEach(k => {
          if (isInformationalKey(k, cat.Category)) return;
          const m = ds.data.values.find(v => canonKey(v.key) === canonKey(k.Key));
          const n = m ? Number(m.alignmentValue) : NaN;
          if (isFinite(n) && n > 0) vals.push(n);
        });
        if (vals.length > 0) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          if (isFinite(avg)) catAverages.push(avg);
        }
      });
      const overall = catAverages.length > 0 ? Number((catAverages.reduce((a, b) => a + b, 0) / catAverages.length).toFixed(1)) : NaN;
      container.appendChild(makeScoreChip(isFinite(overall) ? overall : null));
      try {
        const peopleEff = getEffectivePeople(mainData);
        if (Array.isArray(peopleEff) && peopleEff.length > 0 && isFinite(overall)) {
          const totals = [];
          peopleEff.forEach(person => {
            let total = 0;
            let count = 0;
            mainData.Categories.forEach(cat => {
              const weight = person.weights ? Number(person.weights[cat.Category]) : NaN;
              if (!isFinite(weight)) return;
              const match = ds.data.categories && ds.data.categories[cat.Category];
              const score = match && isFinite(match.overall) ? Number(match.overall) : NaN;
              if (!isFinite(score)) return;
              total += score * weight;
              count += weight;
            });
            if (count > 0) {
              totals.push({ name: person.name, score: Number((total / count).toFixed(1)) });
            }
          });
          totals.forEach(({ name, score }) => {
            container.appendChild(document.createTextNode(' '));
            container.appendChild(makePersonScoreChip(name, score));
          });
        }
      } catch {}
    });
  } catch {}

  mainData.Categories.forEach(category => {
    const catRow = document.createElement('tr');
    catRow.className = 'category-header-row';
    const catNameTh = document.createElement('th');
    const catName = category.Category;
    catNameTh.innerHTML = '';
    const toggle = document.createElement('button');
    toggle.className = 'cat-toggle';
    const initiallyCollapsed = collapsedSet.has(catName);
    toggle.textContent = initiallyCollapsed ? '▸' : '▾';
    toggle.setAttribute('aria-expanded', initiallyCollapsed ? 'false' : 'true');
    toggle.title = initiallyCollapsed ? 'Expand category' : 'Collapse category';
    const catLabelSpan = document.createElement('span');
    catLabelSpan.textContent = catName;
    catNameTh.appendChild(toggle);
    catNameTh.appendChild(catLabelSpan);
    catRow.appendChild(catNameTh);
    datasets.forEach(ds => {
      const values = [];
      category.Keys.forEach(k => {
        if (isInformationalKey(k, category.Category)) return;
        const m = ds.data.values.find(v => canonKey(v.key) === canonKey(k.Key));
        const n = m ? Number(m.alignmentValue) : NaN;
        if (isFinite(n) && n > 0) values.push(n);
      });
      const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length) : NaN;
      const th = document.createElement('th');
      const avgNum = isFinite(avg) ? Number(avg.toFixed(1)) : NaN;
      th.appendChild(makeScoreChip(isFinite(avgNum) ? avgNum : null));
      try {
        const peopleEff = getEffectivePeople(mainData);
        if (Array.isArray(peopleEff) && isFinite(avgNum)) {
          peopleEff.forEach(person => {
            const w = person && person.weights ? Number(person.weights[category.Category]) : NaN;
            if (!isFinite(w)) return;
            const adjusted = Number((avgNum * w).toFixed(1));
            th.appendChild(document.createTextNode(' '));
            th.appendChild(makePersonScoreChip(person.name, adjusted));
          });
        }
      } catch {}
      catRow.appendChild(th);
    });
    tbody.appendChild(catRow);

    const keyRowRefs = [];
    category.Keys.forEach(keyObj => {
      const informational = isInformationalKey(keyObj, category.Category);
      const tr = document.createElement('tr');
      tr.dataset.category = catName;
      if (informational) tr.classList.add('informational-key');
      const keyTd = document.createElement('td');
      keyTd.className = 'key-cell';
      const keyInner = document.createElement('div');
      keyInner.className = 'key-inner';
      if (keyObj.Hidden) {
        tr.classList.add('hidden-key');
        keyInner.classList.add('hidden-key-inner');
      }
      const keyLabel = document.createElement('span');
      keyLabel.textContent = keyObj.Key;
      keyInner.appendChild(keyLabel);
      const actionButtons = [];
      try {
        const guideBtn = makeKeyGuidanceButton(category.Category, keyObj);
        if (guideBtn) actionButtons.push(guideBtn);
      } catch {}
      try {
        const infoBtn = makeInformationalToggleButton(category.Category, keyObj, {
          onToggle: rerender,
        });
        actionButtons.push(infoBtn);
      } catch {}
      try {
        if (Array.isArray(selectedList) && selectedList.length > 1) {
          const names = datasets.map(d => d.name).slice(0, 4);
          const btn = makeCompareButton(names, category.Category, keyObj.Key);
          actionButtons.push(btn);
        }
      } catch {}
      if (actionButtons.length > 0) {
        keyInner.appendChild(makeKeyActionsMenu(actionButtons));
      }
      keyTd.appendChild(keyInner);
      tr.appendChild(keyTd);

      const perCountry = datasets.map(ds => {
        const match = ds.data.values.find(v => canonKey(v.key) === canonKey(keyObj.Key));
        const hasText = match && typeof match.alignmentText === 'string' && match.alignmentText.trim().length > 0;
        const numeric = match ? Number(match.alignmentValue) : NaN;
        const bucket = informational ? { key: 'informational' } : getScoreBucket(numeric);
        return { match, hasText, numeric, bucketKey: bucket.key };
      });

      const counts = new Map();
      if (!informational) {
        perCountry.forEach(pc => counts.set(pc.bucketKey, (counts.get(pc.bucketKey) || 0) + 1));
      }
      let majorityKey = null, majorityCount = -1;
      if (!informational) {
        for (const [k, c] of counts.entries()) {
          if (c > majorityCount) { majorityKey = k; majorityCount = c; }
        }
      }

      datasets.forEach((ds, idx) => {
        const td = document.createElement('td');
        td.className = 'value-cell';
        if (informational) td.classList.add('informational-key');
        const info = perCountry[idx];
        const match = info.match;
        const hasText = info.hasText;
        const wrap = document.createElement('div');
        wrap.className = 'cell-inner';
        const chip = informational ? makeInformationalPlaceholderChip() : makeScoreChip(match ? info.numeric : null);
        wrap.appendChild(chip);
        let textForQuery = '';
        if (hasText) {
          appendTextWithLinks(wrap, match.alignmentText);
          textForQuery = String(match.alignmentText || '');
        } else {
          const label = (match && info.numeric === -1) ? 'Unknown' : 'No data';
          wrap.appendChild(document.createTextNode(label));
          textForQuery = label;
        }
        try {
          const btn = makeDigInButton(ds.name, category.Category, keyObj.Key, textForQuery);
          wrap.appendChild(btn);
        } catch {}
        if (ds?.node?.type === 'city' && match && match.inheritedFromParent) {
          td.classList.add('inherited-value');
          const parentName = ds.node && ds.node.parentCountry && ds.node.parentCountry.name ? ds.node.parentCountry.name : null;
          const tooltip = parentName ? `Score inherited from ${parentName}` : 'Score inherited from parent country';
          if (!td.title) td.title = tooltip;
          const srOnly = document.createElement('span');
          srOnly.className = 'visually-hidden';
          srOnly.textContent = tooltip;
          wrap.appendChild(srOnly);
        }
        td.appendChild(wrap);
        if (!informational && diffEnabled && counts.size > 1 && info.bucketKey !== majorityKey) {
          td.classList.add('diff-cell');
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
      keyRowRefs.push(tr);
    });

    if (initiallyCollapsed) {
      keyRowRefs.forEach(r => { r.style.display = 'none'; });
      catRow.classList.add('collapsed');
      toggle.textContent = '▸';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.title = 'Expand category';
    }
    toggle.addEventListener('click', () => {
      const isCollapsed = catRow.classList.toggle('collapsed');
      toggle.textContent = isCollapsed ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      toggle.title = isCollapsed ? 'Expand category' : 'Collapse category';
      keyRowRefs.forEach(r => { r.style.display = isCollapsed ? 'none' : ''; });
      try {
        const current = new Set(getStored('collapsedCategories', []));
        if (isCollapsed) current.add(catName); else current.delete(catName);
        setStored('collapsedCategories', Array.from(current));
      } catch {}
    });

    catSections.push({ name: catName, header: catRow, rows: keyRowRefs, toggle });
  });

  table.appendChild(tbody);

  if (collapseCategoriesBtn) {
    if (!catSections.length) {
      collapseCategoriesBtn.disabled = true;
      collapseCategoriesBtn.onclick = null;
      collapseCategoriesBtn.setAttribute('aria-disabled', 'true');
    } else {
      collapseCategoriesBtn.disabled = false;
      collapseCategoriesBtn.removeAttribute('aria-disabled');
      collapseCategoriesBtn.onclick = () => {
        if (!catSections.length) return;
        const collapsedNames = [];
        catSections.forEach(section => {
          if (!section) return;
          if (section.name) collapsedNames.push(section.name);
          if (section.header) {
            section.header.classList.add('collapsed');
          }
          if (Array.isArray(section.rows)) {
            section.rows.forEach(row => { row.style.display = 'none'; });
          }
          if (section.toggle) {
            section.toggle.textContent = '▸';
            section.toggle.setAttribute('aria-expanded', 'false');
            section.toggle.title = 'Expand category';
          }
        });
        const uniqueNames = Array.from(new Set(collapsedNames.filter(Boolean)));
        setStored('collapsedCategories', uniqueNames);
      };
    }
  }

  const keyMin = 240;
  const countryMin = 320;
  table.style.minWidth = (keyMin + datasets.length * countryMin) + 'px';

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);

  const floating = document.createElement('div');
  floating.className = 'floating-header';
  const frow = document.createElement('div');
  frow.className = 'floating-row';
  floating.appendChild(frow);
  reportDiv.appendChild(floating);
  reportDiv.appendChild(wrap);

  try {
    const rs = options && options.restoreScroll ? options.restoreScroll : getStored('tableScroll', { x: 0, y: 0 });
    if (rs && typeof rs.x === 'number' && typeof rs.y === 'number') {
      wrap.scrollLeft = rs.x;
      wrap.scrollTop = rs.y;
    }
  } catch {}

  const attachRemoveHandlers = (root) => {
    if (!root) return;
    const buttons = root.querySelectorAll('.country-header-remove');
    buttons.forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        handleDeselect(btn.dataset.file || '');
      });
    });
  };

  function buildFloatingFromThead() {
    frow.innerHTML = '';
    const headerRow = table.tHead && table.tHead.rows[0];
    if (!headerRow) return;
    const cells = Array.from(headerRow.cells);
    const widths = cells.map(c => Math.ceil(c.getBoundingClientRect().width));
    frow.style.gridTemplateColumns = widths.map(w => `${w}px`).join(' ');
    cells.forEach(c => {
      const cell = document.createElement('div');
      cell.className = 'fh-cell';
      cell.innerHTML = c.innerHTML;
      frow.appendChild(cell);
    });
    floating.style.width = wrap.clientWidth + 'px';
    attachRemoveHandlers(floating);
  }

  function updateFloatingVisibility() {
    try {
      const headerRect = table.tHead.getBoundingClientRect();
      const show = headerRect.top < 0;
      floating.classList.toggle('visible', show);
      frow.style.transform = `translateX(${-wrap.scrollLeft}px)`;
    } catch {}
  }

  buildFloatingFromThead();
  updateFloatingVisibility();
  wrap.addEventListener('scroll', () => {
    updateFloatingVisibility();
    setStored('tableScroll', { x: wrap.scrollLeft, y: wrap.scrollTop });
  });
  window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
  window.addEventListener('resize', buildFloatingFromThead);

  const floatingContainer = floating.querySelector('.floating-row');
  attachRemoveHandlers(reportDiv);
  attachRemoveHandlers(floatingContainer);
}

export function onSelectionChanged(mainData, notice) {
  const selected = appState.selected;
  if (!selected || selected.length === 0) {
    const legendMount = document.getElementById('legendMount');
    if (legendMount) legendMount.innerHTML = '';
    renderEmptyReportState();
    return;
  }
  const reportDiv = document.getElementById('report');
  const oldWrap = reportDiv ? reportDiv.querySelector('.table-wrap') : null;
  const restoreScroll = oldWrap ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop } : getStored('tableScroll', { x: 0, y: 0 });
  renderComparison(selected, mainData, { diffEnabled: getStored('diffEnabled', false), restoreScroll });
  if (notice) notice.textContent = '';
}

export default {
  renderComparison,
  onSelectionChanged,
  renderEmptyReportState,
};

