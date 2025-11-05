const createDom = () => {
  document.body.innerHTML = `
    <div id="report"></div>
    <div id="legendMount"></div>
    <div id="notice"></div>
    <div id="countryList"></div>
    <button id="collapseCountriesBtn"></button>
    <button id="collapseCategoriesBtn"></button>
  `;
  document.body.className = '';
};

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}

describe('UI helpers', () => {
  let moduleExports;
  let sidebarModule;

  beforeAll(async () => {
    createDom();
    window.__MIGRATION_REPORT_DISABLE_AUTOLOAD__ = true;
    moduleExports = await import('../src/main.js');
    sidebarModule = await import('../src/ui/sidebar.js');
  });

  beforeEach(() => {
    createDom();
    moduleExports.appState.countries = [];
    moduleExports.appState.selected = [];
    moduleExports.appState.nodesByFile = new Map();
    moduleExports.appState.showCitiesOnly = false;
    moduleExports.appState.showHiddenKeys = false;
    moduleExports.appState.expandedState = {};
    moduleExports.appState.mainData = null;
    moduleExports.appState.reportAlerts = new Map();
    if (typeof moduleExports.clearCountryCache === 'function') {
      moduleExports.clearCountryCache();
    }
    localStorage.clear();
    if (typeof fetch === 'function' && fetch.mockClear) {
      fetch.mockClear();
    }
  });

  test('renderEmptyReportState populates placeholder content', () => {
    const report = document.getElementById('report');
    expect(report.children.length).toBe(0);

    moduleExports.renderEmptyReportState();

    expect(report.querySelector('.empty-state')).not.toBeNull();
    expect(report.textContent).toContain('Nothing selected yet');
    expect(report.textContent).toContain('Select up to three countries');
  });

  test('updateCollapseCountriesButton hides button when only cities are shown', () => {
    const button = document.getElementById('collapseCountriesBtn');
    moduleExports.appState.showCitiesOnly = true;

    moduleExports.updateCollapseCountriesButton(true);

    expect(button.hidden).toBe(true);
    expect(button.disabled).toBe(true);
  });

  test('updateCollapseCountriesButton enables button when expandable nodes exist', () => {
    const button = document.getElementById('collapseCountriesBtn');
    moduleExports.appState.showCitiesOnly = false;

    moduleExports.updateCollapseCountriesButton(true);

    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(false);
  });

  test('sortByOrderThenName sorts by order then name', () => {
    const input = [
      { order: 2, name: 'Bravo' },
      { order: 2, name: 'Alpha' },
      { order: 1, name: 'Zulu' },
    ];

    const sorted = moduleExports.sortByOrderThenName(input, 'order', 'name');

    expect(sorted.map(item => item.name)).toEqual(['Zulu', 'Alpha', 'Bravo']);
    expect(input[0].name).toBe('Bravo');
  });

  test('loadSelectedFromStorage only returns items still present in nodes map', () => {
    const nodes = new Map();
    nodes.set('reports/a.json', { file: 'reports/a.json', name: 'A' });
    nodes.set('reports/b.json', { file: 'reports/b.json', name: 'B' });

    localStorage.setItem('selectedCountries', JSON.stringify(['reports/a.json', 'reports/c.json']));

    const restored = moduleExports.loadSelectedFromStorage(nodes);

    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('A');
  });

  test('saveSelectedToStorage persists selection to localStorage', () => {
    moduleExports.appState.selected = [
      { file: 'reports/a.json' },
      { file: 'reports/b.json' },
    ];

    moduleExports.saveSelectedToStorage();

    expect(localStorage.getItem('selectedCountries')).toBe(JSON.stringify(['reports/a.json', 'reports/b.json']));
  });

  test('computeCountryScoresForSorting ignores informational keys', () => {
    const country = {
      values: [
        { key: 'Scored Key', alignmentValue: 8 },
        { key: 'Info Key', alignmentValue: 10 },
      ],
    };
    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Scored Key', Informational: false },
            { Key: 'Info Key', Informational: true },
          ],
        },
      ],
    };
    const people = [
      { name: 'Persona', weights: { 'Test Category': 2 } },
    ];

    const result = moduleExports.computeCountryScoresForSorting(country, mainData, people);

    expect(result.overall).toBeCloseTo(8);
    expect(result.personTotals.Persona).toBeCloseTo(16);
  });

  test('computeCountryScoresForSorting honors informational override', () => {
    const country = {
      values: [
        { key: 'Scored Key', alignmentValue: 8 },
        { key: 'Info Key', alignmentValue: 10 },
      ],
    };
    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Scored Key', Informational: false },
            { Key: 'Info Key', Informational: true },
          ],
        },
      ],
    };

    localStorage.setItem('informationalOverrides', JSON.stringify({ 'test category|||info key': false }));

    const result = moduleExports.computeCountryScoresForSorting(country, mainData, []);

    expect(result.overall).toBeCloseTo(9);
  });

  test('renderComparison hides score chip for informational keys', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Scored Key', Informational: false },
            { Key: 'Info Key', Informational: true },
          ],
        },
      ],
      People: [],
    };

    const reportData = {
      iso: 'tc',
      values: [
        { key: 'Scored Key', alignmentValue: 7, alignmentText: 'Regular value.' },
        { key: 'Info Key', alignmentValue: 9, alignmentText: 'Narrative only.' },
      ],
    };

    fetch.mockImplementation(async () => ({
      ok: true,
      json: async () => reportData,
    }));

    await moduleExports.renderComparison([
      { name: 'Testland', file: 'test.json' },
    ], mainData, {});

    const scoredRow = Array.from(document.querySelectorAll('.comparison-table tbody tr'))
      .find(row => row.querySelector('.key-cell')?.textContent?.includes('Scored Key'));
    expect(scoredRow).toBeDefined();
    const scoredChip = scoredRow.querySelector('td.value-cell .score-chip');
    expect(scoredChip).not.toBeNull();
    expect(scoredChip.classList.contains('placeholder')).toBe(false);

    const infoRow = Array.from(document.querySelectorAll('.comparison-table tbody tr'))
      .find(row => row.querySelector('.key-cell')?.textContent?.includes('Info Key'));
    expect(infoRow).toBeDefined();
    const infoChip = infoRow.querySelector('td.value-cell .score-chip');
    expect(infoChip).not.toBeNull();
    expect(infoChip.classList.contains('placeholder')).toBe(true);
    const infoToggle = infoRow.querySelector('.info-toggle-btn');
    expect(infoToggle).not.toBeNull();
    expect(infoToggle.textContent).toContain('Include in scoring');

    fetch.mockReset();
  });

  test('key guidance dialog reflects stored alert thresholds', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
      '<dialog id="keyGuidanceDialog">',
      '  <div class="kg-header">',
      '    <div class="kg-title-wrap">',
      '      <h3 id="kgDialogTitle" class="kg-title"></h3>',
      '      <p class="kg-subtitle"></p>',
      '    </div>',
      '    <button type="button" class="kg-close">Close</button>',
      '  </div>',
      '  <div id="kgDialogBody" class="kg-body">',
      '    <section class="kg-section"><h4>Key guidance</h4><p id="kgKeyGuidanceText"></p></section>',
      '    <section class="kg-section">',
      '      <h4>Rating guidance</h4>',
      '      <p id="kgConsiderations" class="kg-considerations"></p>',
      '      <table class="kg-table"><tbody id="kgTableBody"></tbody></table>',
      '    </section>',
      '    <section class="kg-section kg-alerts">',
      '      <h4>Alert thresholds</h4>',
      '      <div class="kg-alert-row">',
      '        <label for="kgAlertConcerning">Concerning at…</label>',
      '        <select id="kgAlertConcerning"><option value="none">None</option></select>',
      '      </div>',
      '      <div class="kg-alert-row">',
      '        <label for="kgAlertIncompatible">Incompatible at…</label>',
      '        <select id="kgAlertIncompatible"><option value="none">None</option></select>',
      '      </div>',
      '    </section>',
      '  </div>',
      '</dialog>',
    ].join('');

    moduleExports.appState.mainData = null;
    moduleExports.appState.keyGuidanceIndex = new Map();
    const storageKey = 'test category|||safety';
    localStorage.setItem('keyAlerts', JSON.stringify({ [storageKey]: { concerning: 6, incompatible: 4 } }));

    const keyObj = {
      Key: 'Safety',
      Guidance: 'Stay alert.',
      RatingGuide: [
        { rating: 4, guidance: 'Challenging' },
        { rating: 6, guidance: 'Concerning' },
      ],
    };

    moduleExports.openKeyGuidanceDialog('Test Category', keyObj);

    const concerningSelect = document.getElementById('kgAlertConcerning');
    const incompatibleSelect = document.getElementById('kgAlertIncompatible');
    expect(concerningSelect.value).toBe('6');
    expect(incompatibleSelect.value).toBe('4');
    expect(concerningSelect.options).toHaveLength(3);
    expect(Array.from(concerningSelect.options).map(opt => opt.value)).toEqual(['none', '4', '6']);

    concerningSelect.value = 'none';
    expect(concerningSelect.value).toBe('none');
    concerningSelect.dispatchEvent(new Event('change'));

    let stored = JSON.parse(localStorage.getItem('keyAlerts'));
    expect(stored[storageKey]).toMatchObject({ concerning: null, incompatible: 4 });

    incompatibleSelect.value = 'none';
    incompatibleSelect.dispatchEvent(new Event('change'));

    stored = JSON.parse(localStorage.getItem('keyAlerts'));
    expect(stored).toEqual({});
  });

  test('renderComparison adds alert icons when thresholds are met', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"><div class="country-item selected" data-file="test.json" data-name="Testland"></div></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Scored Key', Informational: false },
          ],
        },
      ],
      People: [],
    };

    localStorage.setItem('keyAlerts', JSON.stringify({ 'test category|||scored key': { concerning: 7, incompatible: 5 } }));

    const reportData = {
      iso: 'tc',
      values: [
        { key: 'Scored Key', alignmentValue: 4, alignmentText: 'Low alignment.' },
      ],
    };

    fetch.mockImplementation(async () => ({
      ok: true,
      json: async () => reportData,
    }));

    const selectedNode = { name: 'Testland', file: 'test.json', type: 'country' };
    moduleExports.appState.selected = [selectedNode];
    moduleExports.appState.nodesByFile = new Map([[selectedNode.file, selectedNode]]);
    moduleExports.appState.mainData = mainData;

    await moduleExports.renderComparison([selectedNode], mainData, {});

    const cellIcon = document.querySelector('.comparison-table tbody tr .cell-inner .alert-icon');
    expect(cellIcon).not.toBeNull();
    expect(cellIcon.classList.contains('alert-icon--incompatible')).toBe(true);
    expect(cellIcon.title).toContain('incompatible');

    const headerIcon = document.querySelector('.country-header .alert-icon');
    expect(headerIcon).not.toBeNull();
    expect(headerIcon.classList.contains('alert-icon--incompatible')).toBe(true);

    const sidebarIcon = document.querySelector('#countryList .country-item .alert-icon');
    expect(sidebarIcon).not.toBeNull();
    expect(sidebarIcon.classList.contains('alert-icon--incompatible')).toBe(true);

    // Re-render the sidebar list to ensure alerts persist after DOM refreshes
    const listEl = document.getElementById('countryList');
    const noticeEl = document.getElementById('notice');
    const countryNode = { ...selectedNode, cities: [], expanded: false };
    moduleExports.appState.countries = [countryNode];
    sidebarModule.renderCountryList(listEl, moduleExports.appState.countries, noticeEl, () => {});
    sidebarModule.updateCountryListSelection(listEl);

    const sidebarIconAfter = document.querySelector('#countryList .country-item .alert-icon');
    expect(sidebarIconAfter).not.toBeNull();
    expect(sidebarIconAfter.classList.contains('alert-icon--incompatible')).toBe(true);

    const alerts = moduleExports.appState.reportAlerts;
    expect(alerts instanceof Map).toBe(true);
    const entry = alerts.get('test.json');
    expect(entry).toBeDefined();
    expect(entry.status).toBe('incompatible');
    expect(Array.isArray(entry.reasons)).toBe(true);
    expect(entry.reasons[0]).toContain('Scored Key');

    fetch.mockReset();
  });

  test('informational toggle button applies override and rerenders scoring state', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Scored Key', Informational: false },
            { Key: 'Info Key', Informational: true },
          ],
        },
      ],
      People: [],
    };

    const reportData = {
      iso: 'tc',
      values: [
        { key: 'Scored Key', alignmentValue: 7, alignmentText: 'Regular value.' },
        { key: 'Info Key', alignmentValue: 9, alignmentText: 'Narrative only.' },
      ],
    };

    fetch.mockImplementation(async () => ({
      ok: true,
      json: async () => reportData,
    }));

    await moduleExports.renderComparison([
      { name: 'Testland', file: 'test.json' },
    ], mainData, {});

    let infoRow = Array.from(document.querySelectorAll('.comparison-table tbody tr'))
      .find(row => row.querySelector('.key-cell')?.textContent?.includes('Info Key'));
    expect(infoRow).toBeDefined();
    const toggle = infoRow.querySelector('.info-toggle-btn');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Include in scoring');

    toggle.click();
    await flushPromises();
    await flushPromises();

    const overrides = JSON.parse(localStorage.getItem('informationalOverrides'));
    expect(overrides).toMatchObject({ 'test category|||info key': false });

    infoRow = Array.from(document.querySelectorAll('.comparison-table tbody tr'))
      .find(row => row.querySelector('.key-cell')?.textContent?.includes('Info Key'));
    expect(infoRow).toBeDefined();
    const infoChip = infoRow.querySelector('td.value-cell .score-chip');
    expect(infoChip).not.toBeNull();
    expect(infoChip.classList.contains('placeholder')).toBe(false);
    expect(infoChip.textContent.trim()).toBe('9');

    fetch.mockReset();
  });

  test('clicking remove button deselects report', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Test Category',
          Keys: [
            { Key: 'Example Key', Informational: false },
          ],
        },
      ],
      People: [],
    };

    const reportData = {
      iso: 'tc',
      values: [
        { key: 'Example Key', alignmentValue: 7, alignmentText: 'Sample text.' },
      ],
    };

    fetch.mockImplementation(async () => ({
      ok: true,
      json: async () => reportData,
    }));

    const selectedNode = { name: 'Testland', file: 'test.json' };
    moduleExports.appState.selected = [selectedNode];
    moduleExports.appState.nodesByFile = new Map([[selectedNode.file, selectedNode]]);

    await moduleExports.renderComparison(moduleExports.appState.selected, mainData);
    await flushPromises();

    const removeBtn = document.querySelector('.country-header-remove');
    expect(removeBtn).not.toBeNull();

    removeBtn.click();
    await flushPromises();

    expect(moduleExports.appState.selected).toHaveLength(0);
    fetch.mockReset();
  });

  test('hidden keys render and respond to visibility toggles', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<div id="notice"></div>',
      '<div id="countryList"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Climate',
          Keys: [
            { Key: 'Visible Metric', Informational: false },
            { Key: 'Hidden Metric', Informational: false, Hidden: true },
          ],
        },
      ],
      People: [],
    };

    const reportData = {
      iso: 'aa',
      values: [
        { key: 'Visible Metric', alignmentValue: 6, alignmentText: 'Visible text' },
        { key: 'Hidden Metric', alignmentValue: 7, alignmentText: 'Hidden text' },
      ],
    };

    fetch.mockImplementation(async () => ({
      ok: true,
      json: async () => reportData,
    }));

    await moduleExports.renderComparison([
      { name: 'Country A', file: 'reports/a.json', type: 'country' },
    ], mainData, {});

    const hiddenRows = document.querySelectorAll('tr.hidden-key');
    expect(hiddenRows.length).toBe(1);
    expect(document.body.classList.contains('show-hidden-keys')).toBe(false);

    moduleExports.toggleHiddenKeysVisibility();
    expect(document.body.classList.contains('show-hidden-keys')).toBe(true);
    expect(moduleExports.appState.showHiddenKeys).toBe(true);
    expect(localStorage.getItem('showHiddenKeys')).toBe('true');

    moduleExports.toggleHiddenKeysVisibility();
    expect(document.body.classList.contains('show-hidden-keys')).toBe(false);
    expect(moduleExports.appState.showHiddenKeys).toBe(false);
    expect(localStorage.getItem('showHiddenKeys')).toBe('false');

    fetch.mockReset();
  });
});
