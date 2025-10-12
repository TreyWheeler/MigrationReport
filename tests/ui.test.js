const path = require('path');

const createDom = () => {
  document.body.className = '';
  document.body.innerHTML = '<div id="report"></div><button id="collapseCountriesBtn"></button>';
};

describe('UI helpers', () => {
  let exports;

  beforeAll(() => {
    createDom();
    window.__MIGRATION_REPORT_DISABLE_AUTOLOAD__ = true;
    exports = require(path.resolve(__dirname, '..', 'script.js'));
  });

  beforeEach(() => {
    createDom();
    exports.appState.countries = [];
    exports.appState.selected = [];
    exports.appState.nodesByFile = new Map();
    exports.appState.showCitiesOnly = false;
    exports.appState.showHiddenKeys = false;
    exports.appState.expandedState = {};
    localStorage.clear();
    if (typeof fetch === 'function' && fetch.mockClear) {
      fetch.mockClear();
    }
  });

  test('renderEmptyReportState populates placeholder content', () => {
    const report = document.getElementById('report');
    expect(report.children.length).toBe(0);

    exports.renderEmptyReportState();

    expect(report.querySelector('.empty-state')).not.toBeNull();
    expect(report.textContent).toContain('Nothing selected yet');
    expect(report.textContent).toContain('Select up to three countries');
  });

  test('updateCollapseCountriesButton hides button when only cities are shown', () => {
    const button = document.getElementById('collapseCountriesBtn');
    exports.appState.showCitiesOnly = true;

    exports.updateCollapseCountriesButton(true);

    expect(button.hidden).toBe(true);
    expect(button.disabled).toBe(true);
  });

  test('updateCollapseCountriesButton enables button when expandable nodes exist', () => {
    const button = document.getElementById('collapseCountriesBtn');
    exports.appState.showCitiesOnly = false;

    exports.updateCollapseCountriesButton(true);

    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(false);
  });

  test('sortByOrderThenName sorts by order then name', () => {
    const input = [
      { order: 2, name: 'Bravo' },
      { order: 2, name: 'Alpha' },
      { order: 1, name: 'Zulu' },
    ];

    const sorted = exports.sortByOrderThenName(input, 'order', 'name');

    expect(sorted.map(item => item.name)).toEqual(['Zulu', 'Alpha', 'Bravo']);
    expect(input[0].name).toBe('Bravo');
  });

  test('loadSelectedFromStorage only returns items still present in nodes map', () => {
    const nodes = new Map();
    nodes.set('reports/a.json', { file: 'reports/a.json', name: 'A' });
    nodes.set('reports/b.json', { file: 'reports/b.json', name: 'B' });

    localStorage.setItem('selectedCountries', JSON.stringify(['reports/a.json', 'reports/c.json']));

    const restored = exports.loadSelectedFromStorage(nodes);

    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('A');
  });

  test('saveSelectedToStorage persists selection to localStorage', () => {
    exports.appState.selected = [
      { file: 'reports/a.json' },
      { file: 'reports/b.json' },
    ];

    exports.saveSelectedToStorage();

    expect(localStorage.getItem('selectedCountries')).toBe(JSON.stringify(['reports/a.json', 'reports/b.json']));
  });

  test('hidden keys render and respond to visibility toggles', async () => {
    document.body.innerHTML = [
      '<div id="report"></div>',
      '<div id="legendMount"></div>',
      '<button id="collapseCountriesBtn"></button>',
      '<button id="collapseCategoriesBtn"></button>',
    ].join('');

    const mainData = {
      Categories: [
        {
          Category: 'Climate',
          Keys: [
            { Key: 'Visible Metric' },
            { Key: 'Hidden Metric', Hidden: true },
          ],
        },
      ],
      People: [],
    };

    const values = [
      { key: 'Visible Metric', alignmentValue: 6, alignmentText: 'Visible text' },
      { key: 'Hidden Metric', alignmentValue: 7, alignmentText: 'Hidden text' },
    ];

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ iso: 'AA', values }),
    }));

    await exports.renderComparison([
      { name: 'Country A', file: 'reports/a.json', type: 'country' },
    ], mainData, {});

    const hiddenRows = document.querySelectorAll('tr.hidden-key');
    expect(hiddenRows.length).toBe(1);
    expect(document.body.classList.contains('show-hidden-keys')).toBe(false);

    exports.toggleHiddenKeysVisibility();
    expect(document.body.classList.contains('show-hidden-keys')).toBe(true);
    expect(exports.appState.showHiddenKeys).toBe(true);
    expect(localStorage.getItem('showHiddenKeys')).toBe('true');

    exports.toggleHiddenKeysVisibility();
    expect(document.body.classList.contains('show-hidden-keys')).toBe(false);
    expect(exports.appState.showHiddenKeys).toBe(false);
    expect(localStorage.getItem('showHiddenKeys')).toBe('false');
  });
});
