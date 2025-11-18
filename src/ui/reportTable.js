import { appState, resetKeyActionsMenuState, clearCachedMetrics } from '../state/appState.js';
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
import { toggleSelectNode, updateCountryListSelection, applyCountrySort, applySidebarAlerts } from './sidebar.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';
import { getEffectivePeople } from '../data/weights.js';
import { isInformationalKey } from '../data/informationalOverrides.js';
import {
  showLoadingIndicator,
  hideLoadingIndicator,
  showLoadingError,
  waitForLoadingIndicatorFrame,
} from './loadingIndicator.js';
import { getKeyAlertLevels, evaluateScoreAgainstLevels } from '../data/keyAlerts.js';
import { createAlertIcon } from './components/alerts.js';
import { canonKey, buildAlertReason, buildAlertTooltip } from '../data/alertUtils.js';

function ensureAlertEntry(map, key) {
  if (!map || !key) return null;
  let entry = map.get(key);
  if (!entry) {
    entry = { status: null, reasons: [] };
    map.set(key, entry);
  }
  if (!Array.isArray(entry.reasons)) {
    entry.reasons = [];
  }
  return entry;
}

function applySeverityToEntry(entry, severity, reason) {
  if (!entry || !severity) return;
  if (reason) {
    entry.reasons.push(reason);
  }
  if (severity === 'incompatible') {
    entry.status = 'incompatible';
  } else if (entry.status !== 'incompatible') {
    entry.status = 'concerning';
  }
}

function getCategoryAlertKey(categoryName, datasetKey) {
  return `${datasetKey || ''}|||${categoryName || ''}`;
}

function normalizeCategoryName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

function buildAlertKeyConfigs(mainData) {
  const configs = [];
  const categories = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  categories.forEach(category => {
    if (!category || !Array.isArray(category.Keys)) return;
    const categoryName = category.Category;
    category.Keys.forEach(keyObj => {
      if (!keyObj || isInformationalKey(keyObj, categoryName)) return;
      const thresholds = getKeyAlertLevels(categoryName, keyObj.Key);
      if (!thresholds) return;
      const { concerning, incompatible } = thresholds;
      const hasConcerning = Number.isFinite(concerning);
      const hasIncompatible = Number.isFinite(incompatible);
      if (!hasConcerning && !hasIncompatible) return;
      configs.push({
        categoryName,
        keyName: keyObj.Key,
        canonicalKey: canonKey(keyObj.Key),
        thresholds,
      });
    });
  });
  return configs;
}

async function refreshAllReportAlerts(mainDataOverride) {
  const mainData = mainDataOverride || appState.mainData;
  const configs = buildAlertKeyConfigs(mainData);
  if (configs.length === 0) {
    appState.reportAlerts = new Map();
    applySidebarAlerts(appState.reportAlerts);
    return appState.reportAlerts;
  }

  const nodes = [];
  const seenFiles = new Set();
  const appendNode = (node) => {
    if (!node || !node.file) return;
    if (seenFiles.has(node.file)) return;
    seenFiles.add(node.file);
    nodes.push(node);
  };

  if (Array.isArray(appState.countries)) {
    appState.countries.forEach(country => {
      appendNode(country);
      if (country && Array.isArray(country.cities)) {
        country.cities.forEach(city => appendNode(city));
      }
    });
  }

  if (appState.nodesByFile && typeof appState.nodesByFile.forEach === 'function') {
    appState.nodesByFile.forEach(node => appendNode(node));
  }

  if (nodes.length === 0) {
    appState.reportAlerts = new Map();
    applySidebarAlerts(appState.reportAlerts);
    return appState.reportAlerts;
  }

  const datasetResults = await Promise.all(nodes.map(async node => {
    try {
      const data = await fetchCountry(node.file, {
        parentFile: getParentFileForNode(node),
        resolveParentFile: resolveParentReportFile,
      });
      return { node, data };
    } catch {
      return { node, data: null };
    }
  }));

  const alertMap = new Map();

  datasetResults.forEach(({ node, data }) => {
    if (!node || !node.file || !data || !Array.isArray(data.values)) return;
    const valueMap = new Map();
    data.values.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const key = canonKey(entry.key);
      if (!key) return;
      valueMap.set(key, entry);
    });

    let status = null;
    const reasons = [];

    configs.forEach(config => {
      const entry = valueMap.get(config.canonicalKey);
      if (!entry) return;
      const numericScore = Number(entry.alignmentValue);
      if (!Number.isFinite(numericScore) || numericScore < 0) return;
      const severity = evaluateScoreAgainstLevels(numericScore, config.thresholds);
      if (!severity) return;
      const severityThreshold = severity === 'incompatible'
        ? config.thresholds.incompatible
        : config.thresholds.concerning;
      if (!Number.isFinite(severityThreshold)) return;
      const reason = buildAlertReason(
        config.categoryName,
        config.keyName,
        severity,
        numericScore,
        severityThreshold,
      );
      reasons.push(reason);
      if (severity === 'incompatible') {
        status = 'incompatible';
      } else if (status !== 'incompatible') {
        status = 'concerning';
      }
    });

    if (status) {
      alertMap.set(node.file, {
        status,
        reasons,
      });
    }
  });

  appState.reportAlerts = alertMap;
  applySidebarAlerts(alertMap);
  return alertMap;
}

export function renderEmptyReportState() {
  const reportDiv = document.getElementById('report');
  if (!reportDiv) return;
  reportDiv.innerHTML = '';
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('has-category-focus');
  }
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

let activeRenderToken = 0;

export async function renderComparison(selectedList, mainData, options = {}) {
  const reportDiv = document.getElementById('report');
  if (!reportDiv) return;
  const {
    diffEnabled: diffEnabledOption = false,
    restoreScroll,
    skipLoadingIndicator = false,
    loadingMessage,
    loadingDelayMs = 0,
  } = options || {};

  const collapseCategoriesBtn = document.getElementById('collapseCategoriesBtn');
  if (collapseCategoriesBtn) {
    collapseCategoriesBtn.disabled = true;
    collapseCategoriesBtn.onclick = null;
    collapseCategoriesBtn.setAttribute('aria-disabled', 'true');
  }

  const renderToken = ++activeRenderToken;
  const shouldShowLoading = !skipLoadingIndicator;
  if (shouldShowLoading) {
    showLoadingIndicator(loadingMessage || 'Refreshing report data…');
    await waitForLoadingIndicatorFrame();
    if (loadingDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, loadingDelayMs));
    }
  }

  let renderSucceeded = false;
  try {
    const selectedArray = Array.isArray(selectedList) ? selectedList.slice() : [];
    const datasets = await Promise.all(selectedArray.map(async s => ({
      name: s && s.name,
      file: s && s.file,
      node: s,
      data: await fetchCountry(s && s.file, {
        parentFile: getParentFileForNode(s),
        resolveParentFile: resolveParentReportFile,
      })
    })));

    datasets.forEach((ds, idx) => {
      ds.alertKey = ds && ds.file ? ds.file : `dataset-${idx}`;
    });

    if (renderToken !== activeRenderToken) {
      return;
    }

    const legendMount = document.getElementById('legendMount');
    if (legendMount) {
      legendMount.innerHTML = '';
      legendMount.appendChild(buildLegend());
    }

    reportDiv.innerHTML = '';
    closeKeyActionsMenu();
    resetKeyActionsMenuState();

    const diffEnabled = !!diffEnabledOption;

    const focusList = Array.isArray(appState.focusedCategories)
      ? appState.focusedCategories.map(name => (typeof name === 'string' ? name.trim() : '')).filter(Boolean)
      : [];
    const focusNormalized = focusList.map(name => normalizeCategoryName(name)).filter(Boolean);
    const normalizedFocusSet = new Set(focusNormalized);
    const matchesFocus = (name) => normalizedFocusSet.has(normalizeCategoryName(name));
    const focusActive = normalizedFocusSet.size > 0
      && Array.isArray(mainData?.Categories)
      && mainData.Categories.some(cat => matchesFocus(cat && cat.Category));
    const shouldIncludeForSummary = (name) => !focusActive || matchesFocus(name);

    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('has-category-focus', focusActive);
    }

    const rerender = async (overrideOptions) => {
      const overrides = (overrideOptions && typeof overrideOptions === 'object') ? overrideOptions : {};
      const wrap = reportDiv.querySelector('.table-wrap');
      const restore = wrap ? { x: wrap.scrollLeft, y: wrap.scrollTop } : undefined;
      const nextSelected = Array.isArray(appState.selected) && appState.selected.length > 0
        ? appState.selected
        : selectedArray;
      const opts = {
        diffEnabled,
        loadingMessage,
        skipLoadingIndicator,
        loadingDelayMs,
        ...overrides,
      };
      if (restore) opts.restoreScroll = restore;
      await renderComparison(nextSelected, mainData, opts);
    };

    const table = document.createElement('table');
    table.className = 'comparison-table';
    table.classList.toggle('focus-active', focusActive);
    if (focusActive) {
      const activeNames = focusList.filter(name => matchesFocus(name));
      if (activeNames.length > 0) {
        table.dataset.focusCategory = activeNames.join(', ');
      } else {
        delete table.dataset.focusCategory;
      }
    } else {
      delete table.dataset.focusCategory;
    }

    const handleDeselect = (fileOrNode) => {
      if (!fileOrNode) return;
      try {
        let node = null;
        if (typeof fileOrNode === 'string') {
          if (!fileOrNode) return;
          const map = appState.nodesByFile;
          if (map && typeof map.get === 'function') {
            node = map.get(fileOrNode) || null;
          }
          if (!node && Array.isArray(appState.selected)) {
            node = appState.selected.find(n => n && n.file === fileOrNode) || null;
          }
        } else if (fileOrNode && typeof fileOrNode === 'object') {
          node = fileOrNode;
        }
        if (!node) return;
        const noticeEl = document.getElementById('notice');
        toggleSelectNode(node, noticeEl);
        const listEl = document.getElementById('countryList');
        if (listEl) updateCountryListSelection(listEl);
        void onSelectionChanged(mainData, noticeEl, { loadingMessage });
      } catch {}
    };

    const headerScoreTargets = [];
    const headerAlertTargets = [];
    const datasetAlertMap = new Map();
    const categoryAlertMap = new Map();

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
      headerAlertTargets.push({ element: labelWrap, dataset: ds });
      if (ds && ds.alertKey && !datasetAlertMap.has(ds.alertKey)) {
        datasetAlertMap.set(ds.alertKey, { status: null, reasons: [] });
      }

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
          if (!shouldIncludeForSummary(cat && cat.Category)) return;
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
        const overall = catAverages.length > 0
          ? Number((catAverages.reduce((a, b) => a + b, 0) / catAverages.length).toFixed(1))
          : NaN;
        container.appendChild(makeScoreChip(isFinite(overall) ? overall : null));
        try {
          const peopleEff = getEffectivePeople(mainData);
          if (Array.isArray(peopleEff) && peopleEff.length > 0 && isFinite(overall)) {
            const totals = [];
            peopleEff.forEach(person => {
              let total = 0;
              let count = 0;
              mainData.Categories.forEach(cat => {
                if (!shouldIncludeForSummary(cat && cat.Category)) return;
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
      const catKeyLabel = typeof catName === 'string' ? catName : '';
      const displayCategoryName = catKeyLabel || 'Category';
      const categoryHeaderTargetsForCategory = [];
      const normalizedCatName = normalizeCategoryName(catName);
      const catIsFocused = matchesFocus(catName);
      catNameTh.innerHTML = '';
      const toggle = document.createElement('button');
      toggle.className = 'cat-toggle';
      const initiallyCollapsed = collapsedSet.has(catName);
      toggle.textContent = initiallyCollapsed ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', initiallyCollapsed ? 'false' : 'true');
      toggle.title = initiallyCollapsed ? 'Expand category' : 'Collapse category';
      const catLabelSpan = document.createElement('span');
      catLabelSpan.className = 'cat-label';
      catLabelSpan.textContent = catName;
      const focusBtn = document.createElement('button');
      focusBtn.type = 'button';
      focusBtn.className = 'cat-focus-btn';
      const alreadyFocused = matchesFocus(catName);
      const svgNS = 'http://www.w3.org/2000/svg';
      const icon = document.createElementNS(svgNS, 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');
      icon.classList.add('cat-focus-icon');
      const outlinePath = document.createElementNS(svgNS, 'path');
      outlinePath.setAttribute('d', 'M12 5c-5.5 0-10 4.5-10 7s4.5 7 10 7 10-4.5 10-7-4.5-7-10-7Z');
      outlinePath.setAttribute('fill', 'none');
      outlinePath.setAttribute('stroke', 'currentColor');
      outlinePath.setAttribute('stroke-width', '1.6');
      outlinePath.setAttribute('stroke-linecap', 'round');
      outlinePath.setAttribute('stroke-linejoin', 'round');
      const pupil = document.createElementNS(svgNS, 'circle');
      pupil.setAttribute('cx', '12');
      pupil.setAttribute('cy', '12');
      pupil.setAttribute('r', '3');
      pupil.setAttribute('fill', 'currentColor');
      icon.appendChild(outlinePath);
      icon.appendChild(pupil);
      focusBtn.appendChild(icon);
      focusBtn.setAttribute('aria-pressed', alreadyFocused ? 'true' : 'false');
      const focusLabel = alreadyFocused
        ? `Remove ${catName} from focus`
        : (focusActive ? `Add ${catName} to focus` : `Focus on ${catName}`);
      focusBtn.title = focusLabel;
      focusBtn.setAttribute('aria-label', focusLabel);
      if (alreadyFocused) {
        focusBtn.classList.add('is-active');
      }
      focusBtn.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const currentList = Array.isArray(appState.focusedCategories)
          ? appState.focusedCategories.slice()
          : [];
        const nextList = currentList.filter(name => normalizeCategoryName(name) !== normalizedCatName);
        const wasActive = nextList.length !== currentList.length;
        if (!wasActive) {
          nextList.push(catName);
        }
        const sanitized = nextList
          .map(name => (typeof name === 'string' ? name.trim() : ''))
          .filter(Boolean);
        appState.focusedCategories = sanitized;
        setStored('focusedCategory', sanitized);
        clearCachedMetrics();
        try {
          const listEl = document.getElementById('countryList');
          const noticeEl = document.getElementById('notice');
          const sortResult = applyCountrySort(
            mainData,
            listEl,
            noticeEl,
            () => onSelectionChanged(mainData, noticeEl)
          );
          if (sortResult && typeof sortResult.then === 'function') {
            sortResult.catch(() => {});
          }
        } catch {}
        focusBtn.blur();
        const message = wasActive
          ? (sanitized.length === 0 ? 'Clearing focused categories…' : `Removing ${catName} from focus…`)
          : (sanitized.length === 1 ? `Focusing on ${catName}…` : `Adding ${catName} to focus…`);
        await rerender({
          skipLoadingIndicator: false,
          loadingMessage: message,
          loadingDelayMs: 120,
        });
      });
      catNameTh.appendChild(toggle);
      catNameTh.appendChild(catLabelSpan);
      catNameTh.appendChild(focusBtn);
      catRow.appendChild(catNameTh);
      if (focusActive) {
        if (catIsFocused) {
          catRow.classList.add('focus-target');
        } else {
          catRow.classList.add('focus-dimmed');
        }
      }
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
        const categoryScoreInner = document.createElement('div');
        categoryScoreInner.className = 'category-score-inner';
        categoryScoreInner.appendChild(makeScoreChip(isFinite(avgNum) ? avgNum : null));
        try {
          const peopleEff = getEffectivePeople(mainData);
          if (Array.isArray(peopleEff) && isFinite(avgNum)) {
            peopleEff.forEach(person => {
              const w = person && person.weights ? Number(person.weights[category.Category]) : NaN;
              if (!isFinite(w)) return;
              const adjusted = Number((avgNum * w).toFixed(1));
              categoryScoreInner.appendChild(makePersonScoreChip(person.name, adjusted));
            });
          }
        } catch {}
        th.appendChild(categoryScoreInner);
        categoryHeaderTargetsForCategory.push({
          element: th,
          dataset: ds,
          categoryKey: catKeyLabel,
          displayName: displayCategoryName,
        });
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
          if (selectedArray.length > 1) {
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

        const thresholds = informational ? null : getKeyAlertLevels(category.Category, keyObj.Key);

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
          let digInButton = null;
          try {
            digInButton = makeDigInButton(ds.name, category.Category, keyObj.Key, textForQuery);
          } catch {}
          let severity = null;
          let severityThreshold = null;
          if (!informational && thresholds) {
            const numericScore = info.numeric;
            if (Number.isFinite(numericScore) && numericScore >= 0) {
              severity = evaluateScoreAgainstLevels(numericScore, thresholds);
              if (severity === 'incompatible') {
                severityThreshold = thresholds.incompatible;
              } else if (severity === 'concerning') {
                severityThreshold = thresholds.concerning;
              }
            }
          }
          if (severity && Number.isFinite(severityThreshold)) {
            const reason = buildAlertReason(category.Category, keyObj.Key, severity, info.numeric, severityThreshold);
            const tooltip = buildAlertTooltip(severity, info.numeric, severityThreshold);
            const srText = ds && ds.name
              ? `${ds.name} ${keyObj.Key} ${severity} alert`
              : `${keyObj.Key} ${severity} alert`;
            const icon = createAlertIcon(severity, tooltip, { variant: 'cell', srText });
            wrap.appendChild(icon);
            const datasetEntry = ensureAlertEntry(datasetAlertMap, ds.alertKey);
            applySeverityToEntry(datasetEntry, severity, reason);
            const categoryEntry = ensureAlertEntry(
              categoryAlertMap,
              getCategoryAlertKey(catKeyLabel, ds.alertKey),
            );
            applySeverityToEntry(categoryEntry, severity, reason);
          }
          if (digInButton) {
            wrap.appendChild(digInButton);
          }
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
        if (focusActive) {
          if (catIsFocused) {
            tr.classList.add('focus-target');
          } else {
            tr.classList.add('focus-dimmed');
          }
        }
      });

      categoryHeaderTargetsForCategory.forEach(target => {
        if (!target || !target.element) return;
        const dataset = target.dataset;
        if (!dataset || !dataset.alertKey) return;
        const entry = categoryAlertMap.get(getCategoryAlertKey(target.categoryKey, dataset.alertKey));
        if (!entry || !entry.status) return;
        const tooltip = Array.isArray(entry.reasons) && entry.reasons.length > 0
          ? entry.reasons.join('\n')
          : `Flagged as ${entry.status}`;
        const srText = dataset && dataset.name
          ? `${dataset.name} ${target.displayName} alert: ${entry.status}`
          : `${target.displayName} alert: ${entry.status}`;
        const icon = createAlertIcon(entry.status, tooltip, { variant: 'category', srText });
        target.element.appendChild(icon);
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

    headerAlertTargets.forEach(({ element, dataset }) => {
      if (!element) return;
      const existing = Array.from(element.querySelectorAll('.alert-icon[data-alert-icon="true"]'));
      existing.forEach(icon => icon.remove());
      if (!dataset || !dataset.alertKey) return;
      const entry = datasetAlertMap.get(dataset.alertKey);
      if (!entry || !entry.status) return;
      const reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
      const tooltip = reasons.length > 0
        ? reasons.join('\n')
        : `Flagged as ${entry.status}`;
      const srText = dataset && dataset.name
        ? `${dataset.name} alert: ${entry.status}`
        : `Alert: ${entry.status}`;
      const icon = createAlertIcon(entry.status, tooltip, { variant: 'header', srText });
      element.appendChild(icon);
    });

    const mergedAlerts = new Map();
    if (appState.reportAlerts && typeof appState.reportAlerts.forEach === 'function') {
      appState.reportAlerts.forEach((value, key) => {
        if (value && value.status) {
          mergedAlerts.set(key, {
            status: value.status,
            reasons: Array.isArray(value.reasons) ? value.reasons.slice() : [],
          });
        }
      });
    }

    datasetAlertMap.forEach((value, key) => {
      if (value && value.status) {
        mergedAlerts.set(key, {
          status: value.status,
          reasons: Array.isArray(value.reasons) ? value.reasons.slice() : [],
        });
      } else {
        mergedAlerts.delete(key);
      }
    });

    appState.reportAlerts = mergedAlerts;
    applySidebarAlerts(mergedAlerts);

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
      const rs = restoreScroll || getStored('tableScroll', { x: 0, y: 0 });
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
        if (btn.dataset.removeHandlerAttached === 'true') return;
        btn.dataset.removeHandlerAttached = 'true';
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

    renderSucceeded = true;
  } catch (error) {
    console.error('Failed to render comparison view', error);
    if (shouldShowLoading) {
      showLoadingError('We hit a snag refreshing the report.');
    }
  } finally {
    if (shouldShowLoading && renderSucceeded && renderToken === activeRenderToken) {
      hideLoadingIndicator();
    }
  }
}

export async function onSelectionChanged(mainData, notice, options = {}) {
  const selected = appState.selected;
  if (!selected || selected.length === 0) {
    const legendMount = document.getElementById('legendMount');
    if (legendMount) legendMount.innerHTML = '';
    renderEmptyReportState();
    return;
  }
  const reportDiv = document.getElementById('report');
  const oldWrap = reportDiv ? reportDiv.querySelector('.table-wrap') : null;
  const restoreScroll = oldWrap
    ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop }
    : getStored('tableScroll', { x: 0, y: 0 });
  await renderComparison(selected, mainData, {
    diffEnabled: getStored('diffEnabled', false),
    restoreScroll,
    loadingMessage: options.loadingMessage,
    skipLoadingIndicator: options.skipLoadingIndicator,
  });
  if (notice) notice.textContent = '';
}

export { refreshAllReportAlerts };

export default {
  renderComparison,
  onSelectionChanged,
  renderEmptyReportState,
  refreshAllReportAlerts,
};

