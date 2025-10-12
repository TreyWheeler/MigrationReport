const path = require('path');

const createDom = () => {
  document.body.innerHTML = `
    <div id="report"></div>
    <div id="legendMount"></div>
    <div id="notice"></div>
    <div id="countryList"></div>
    <button id="collapseCountriesBtn"></button>
    <button id="collapseCategoriesBtn"></button>
  `;
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
    exports.appState.expandedState = {};
    if (typeof exports.clearCountryCache === 'function') {
      exports.clearCountryCache();
    }
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

  test('fetchCountry merges parent entries when sameAsParent is true', async () => {
    const parentFile = 'reports/country.json';
    const cityFile = 'reports/city.json';
    const parentNode = { file: parentFile };
    const cityNode = { file: cityFile, parentCountry: parentNode };
    exports.appState.nodesByFile.set(parentFile, parentNode);
    exports.appState.nodesByFile.set(cityFile, cityNode);

    const parentResponse = {
      version: 2,
      iso: 'PC',
      values: [
        { key: 'Housing', alignmentText: 'Parent text', alignmentValue: 8 },
      ],
    };
    const cityResponse = {
      version: 2,
      iso: 'CT',
      values: [
        { key: 'Housing', sameAsParent: true, note: 'Matches parent context' },
      ],
    };

    fetch.mockImplementation(async (path) => {
      if (path === cityFile) {
        return { ok: true, json: async () => cityResponse };
      }
      if (path === parentFile) {
        return { ok: true, json: async () => parentResponse };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    });

    const first = await exports.fetchCountry(cityFile);
    expect(first.iso).toBe('CT');
    expect(first.values).toHaveLength(1);
    expect(first.values[0].alignmentText).toBe('Parent text');
    expect(first.values[0].alignmentValue).toBe(8);
    expect(first.values[0].note).toBe('Matches parent context');

    fetch.mockClear();
    const second = await exports.fetchCountry(cityFile);
    expect(second.values[0].alignmentValue).toBe(8);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('computeRoundedMetrics includes inherited parent scores for cities', async () => {
    const parentFile = 'reports/country.json';
    const cityFile = 'reports/city.json';
    const parentNode = { file: parentFile };
    const cityNode = { file: cityFile, parentCountry: parentNode };
    exports.appState.nodesByFile.set(parentFile, parentNode);
    exports.appState.nodesByFile.set(cityFile, cityNode);

    const parentResponse = {
      version: 2,
      iso: 'PC',
      values: [
        { key: 'Housing', alignmentText: 'Parent text', alignmentValue: 8 },
      ],
    };
    const cityResponse = {
      version: 2,
      iso: 'CT',
      values: [
        { key: 'Housing', sameAsParent: true, note: 'Matches parent context' },
      ],
    };

    fetch.mockImplementation(async (path) => {
      if (path === cityFile) {
        return { ok: true, json: async () => cityResponse };
      }
      if (path === parentFile) {
        return { ok: true, json: async () => parentResponse };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    });

    const cityData = await exports.fetchCountry(cityFile);
    const mainData = {
      Categories: [
        { Category: 'Housing', Keys: [{ Key: 'Housing' }] },
      ],
      People: [],
    };

    const metrics = exports.computeRoundedMetrics(cityData, mainData);
    expect(metrics.overall).toBe(8);
  });

  test('renderComparison surfaces parent content for inherited city entries', async () => {
    const parentFile = 'reports/country.json';
    const cityFile = 'reports/city.json';
    const parentNode = { name: 'Parentland', file: parentFile, type: 'country' };
    const cityNode = { name: 'Cityville', file: cityFile, type: 'city', parentCountry: parentNode };
    parentNode.cities = [cityNode];
    exports.appState.nodesByFile.set(parentFile, parentNode);
    exports.appState.nodesByFile.set(cityFile, cityNode);

    const parentResponse = {
      version: 2,
      iso: 'PC',
      values: [
        { key: 'Housing', alignmentText: 'Parent housing summary', alignmentValue: 7 },
      ],
    };
    const cityResponse = {
      version: 2,
      iso: 'CT',
      values: [
        { key: 'Housing', sameAsParent: true },
      ],
    };

    fetch.mockImplementation(async (path) => {
      if (path === cityFile) {
        return { ok: true, json: async () => cityResponse };
      }
      if (path === parentFile) {
        return { ok: true, json: async () => parentResponse };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    });

    const mainData = {
      Categories: [
        { Category: 'Housing', Keys: [{ Key: 'Housing' }] },
      ],
      People: [],
    };

    await exports.renderComparison([parentNode, cityNode], mainData, { diffEnabled: false });

    const report = document.getElementById('report');
    expect(report.textContent).toContain('Parent housing summary');
  });
});
