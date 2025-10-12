const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..');
const reportsDir = path.resolve(__dirname, '..', '..', 'reports');

const readJson = relativePath => JSON.parse(fs.readFileSync(path.resolve(dataDir, relativePath), 'utf8'));

const categoriesData = readJson('categories.json');
const categoryKeysData = readJson('category_keys.json');
const countriesData = readJson('countries.json');
const citiesData = readJson('cities.json');
const peopleData = readJson('people.json');
const personWeightsData = readJson('person_weights.json');

const allowedExtraKeys = new Set(['Retirement (Immigrants)']);

describe('Report alignment data', () => {
  const reports = fs.readdirSync(reportsDir).filter(name => name.endsWith('_report.json'));
  const categoryKeyNames = new Set(categoryKeysData.categoryKeys.map(key => key.name));

  reports.forEach(reportFile => {
    test(`${reportFile} contains alignment text and values`, () => {
      const report = JSON.parse(fs.readFileSync(path.join(reportsDir, reportFile), 'utf8'));
      expect(report.values.length).toBeGreaterThan(0);

      const seenKeys = new Set();
      report.values.forEach(entry => {
        expect(typeof entry.key).toBe('string');
        expect(entry.key.trim().length).toBeGreaterThan(0);
        const inheritsFromParent = entry.sameAsParent === true;

        if (inheritsFromParent) {
          expect(entry.alignmentText).toBeUndefined();
          expect(entry.alignmentValue).toBeUndefined();
        } else {
          expect(typeof entry.alignmentText).toBe('string');
          expect(entry.alignmentText.trim().length).toBeGreaterThan(0);
          expect(typeof entry.alignmentValue).toBe('number');
          expect(Number.isNaN(entry.alignmentValue)).toBe(false);
          expect(entry.alignmentValue).toBeGreaterThanOrEqual(-1);
          expect(entry.alignmentValue).toBeLessThanOrEqual(10);
          expect(entry.alignmentValue).not.toBe(0);
        }
        seenKeys.add(entry.key);
        const keyIsKnown = categoryKeyNames.has(entry.key) || allowedExtraKeys.has(entry.key);
        expect(keyIsKnown).toBe(true);
      });

      expect(seenKeys.size).toBe(report.values.length);
    });
  });
});

describe('Geographic dataset relationships', () => {
  const categoryIds = new Set(categoriesData.categories.map(cat => cat.id));
  const countryIds = new Set(countriesData.countries.map(country => country.id));
  const reportFiles = new Set(fs.readdirSync(reportsDir).map(file => `reports/${file}`));

  test('category keys reference valid categories', () => {
    categoryKeysData.categoryKeys.forEach(key => {
      expect(categoryIds.has(key.categoryId)).toBe(true);
      expect(typeof key.guidance).toBe('string');
      expect(key.guidance.trim().length).toBeGreaterThan(0);
    });
  });

  test('countries reference existing reports and have unique IDs', () => {
    const seen = new Set();
    countriesData.countries.forEach(country => {
      expect(country.name && country.name.trim()).toBeTruthy();
      expect(reportFiles.has(country.report)).toBe(true);
      expect(seen.has(country.id)).toBe(false);
      seen.add(country.id);
    });
  });

  test('cities reference valid countries and reports', () => {
    const seen = new Set();
    citiesData.cities.forEach(city => {
      expect(countryIds.has(city.countryId)).toBe(true);
      expect(reportFiles.has(city.report)).toBe(true);
      const key = `${city.countryId}:${city.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });
});

describe('Person weight integrity', () => {
  const peopleIds = new Set(peopleData.people.map(person => person.id));
  const categoryIds = new Set(categoriesData.categories.map(cat => cat.id));

  test('weights reference valid people and categories', () => {
    const seenPairs = new Set();
    personWeightsData.personWeights.forEach(entry => {
      expect(peopleIds.has(entry.personId)).toBe(true);
      expect(categoryIds.has(entry.categoryId)).toBe(true);
      expect(typeof entry.weight).toBe('number');
      expect(Number.isNaN(entry.weight)).toBe(false);
      expect(entry.weight).toBeGreaterThanOrEqual(0);
      expect(entry.weight).toBeLessThanOrEqual(10);
      const key = `${entry.personId}:${entry.categoryId}`;
      expect(seenPairs.has(key)).toBe(false);
      seenPairs.add(key);
    });

    peopleIds.forEach(id => {
      const personEntries = personWeightsData.personWeights.filter(entry => entry.personId === id);
      expect(personEntries).not.toHaveLength(0);
      expect(personEntries).toHaveLength(categoryIds.size);
    });
  });
});
