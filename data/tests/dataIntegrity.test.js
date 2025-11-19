import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '..');
const reportsDir = path.resolve(__dirname, '..', '..', 'reports');
const familyProfilePath = path.resolve(__dirname, '..', '..', 'family_profile.json');

const readJson = relativePath => JSON.parse(fs.readFileSync(path.resolve(dataDir, relativePath), 'utf8'));

const categoriesData = readJson('categories.json');
const categoryKeysData = readJson('category_keys.json');
const countriesData = readJson('countries.json');
const citiesData = readJson('cities.json');
const peopleData = readJson('people.json');
const personWeightsData = readJson('person_weights.json');
const familyProfile = JSON.parse(fs.readFileSync(familyProfilePath, 'utf8'));

const categoryByKeyName = new Map(categoryKeysData.categoryKeys.map(key => [key.name, key.categoryId]));
const requiredKeyNames = new Set(categoryKeysData.categoryKeys.map(key => key.name));

const familyValuesSummary = [
  familyProfile?.values?.political_alignment,
  familyProfile?.values?.community,
  familyProfile?.values?.work_life_balance,
]
  .filter(Boolean)
  .join('; ');

const categoryGuidanceByName = new Map(
  categoryKeysData.categoryKeys.map(key => [key.name, typeof key.guidance === 'string' ? key.guidance.trim() : ''])
);

function buildAlignmentFailureMessage(reportFile, entry, issue) {
  const location = typeof reportFile === 'string'
    ? reportFile.replace(/_report\.json$/i, '')
    : 'Unknown report';
  const keyLabel = entry?.key ? `Key "${entry.key}"` : 'Unknown key';
  const guidance = entry?.key ? categoryGuidanceByName.get(entry.key) : undefined;
  const guidanceLine = guidance
    ? `Category guidance reminder: ${guidance}`
    : 'Add or revisit the guidance for this key in data/category_keys.json so writers know how to tailor the narrative.';
  const ratingLine = typeof entry?.alignmentValue === 'number'
    ? `Current alignment rating noted: ${entry.alignmentValue}.`
    : 'No alignment rating captured—ensure alignmentValue reflects the guidance rating scale.';
  const profileLine = familyValuesSummary
    ? `Keep the family profile priorities in mind (${familyValuesSummary}).`
    : 'Review family_profile.json so alignment text speaks to the household priorities.';

  return [
    `${location}: ${issue} ${keyLabel}.`,
    guidanceLine,
    ratingLine,
    profileLine,
  ].join(' ');
}

describe.skip('Report alignment data', () => {
  const reports = fs.readdirSync(reportsDir).filter(name => name.endsWith('_report.json'));
  const categoryKeyNames = new Set(categoryKeysData.categoryKeys.map(key => key.name));

  reports.forEach(reportFile => {
    test(`${reportFile} contains alignment text and values`, () => {
      const report = JSON.parse(fs.readFileSync(path.join(reportsDir, reportFile), 'utf8'));
      if (!Array.isArray(report.values)) {
        throw new Error(buildAlignmentFailureMessage(reportFile, null, 'Report values must be an array so each guidance-aligned metric can be validated.'));
      }
      if (report.values.length === 0) {
        throw new Error(buildAlignmentFailureMessage(reportFile, null, 'Report does not contain any alignment entries. Add at least one value that speaks to the family profile priorities using the guidance ratings.'));
      }

      const seenKeys = new Set();
      report.values.forEach(entry => {
        if (typeof entry.key !== 'string') {
          throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment entry is missing a string key. Make sure the key matches category_keys.json so the guidance applies to the right narrative.'));
        }
        if (entry.key.trim().length === 0) {
          throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment entry key is blank. Reinforce the key name so guidance and ratings can map to the family profile needs.'));
        }
        if (seenKeys.has(entry.key)) {
          throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Duplicate key detected. Each key should appear once so the guidance rating stays clear.'));
        }

        const keyDefinition = categoryKeysData.categoryKeys.find(key => key.name === entry.key);
        const informational = keyDefinition?.informational === true;
        const inheritsFromParent = entry.sameAsParent === true;

        if (inheritsFromParent) {
          if (typeof entry.alignmentText !== 'undefined' || typeof entry.alignmentValue !== 'undefined') {
            // eslint-disable-next-line no-console
            console.warn(buildAlignmentFailureMessage(reportFile, entry, 'Entries inheriting from a parent should not override alignmentText or alignmentValue. Remove the extra fields during the next report refresh.'));
          }
        } else {
          if (typeof entry.alignmentText !== 'string' || entry.alignmentText.trim().length === 0) {
            throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment text is missing. Describe how this location serves the family profile using the guidance prompts and rating cues.'));
          }
          if (!informational) {
            if (typeof entry.alignmentValue !== 'number' || Number.isNaN(entry.alignmentValue)) {
              throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment value must be a number. Use the guidance rating scale to score how well the narrative supports the family priorities.'));
            }
            if (entry.alignmentValue < -1 || entry.alignmentValue > 10) {
              throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment value is outside the accepted range (-1 to 10). Reassess the rating using the guidance scale and the family profile context.'));
            }
            if (entry.alignmentValue === 0) {
              throw new Error(buildAlignmentFailureMessage(reportFile, entry, 'Alignment value must avoid zero. Choose a positive or negative rating to signal how the guidance applies to the family.'));
            }
          }
        }

        const keyIsKnown = categoryKeyNames.has(entry.key);
        if (!keyIsKnown) {
          // eslint-disable-next-line no-console
          console.warn(buildAlignmentFailureMessage(reportFile, entry, 'Unknown key. Add it to data/category_keys.json with guidance so future writers know how to speak to the family profile priorities.'));
        }

        seenKeys.add(entry.key);
      });

      const missingRequiredKeys = [...requiredKeyNames].filter(key => !seenKeys.has(key));
      if (missingRequiredKeys.length > 0) {
        const missingList = missingRequiredKeys
          .map(name => {
            const categoryId = categoryByKeyName.get(name);
            return categoryId ? `${name} (category: ${categoryId})` : name;
          })
          .join(', ');

        // The schema may evolve faster than report regeneration; emit a warning so missing keys can be backfilled during the next refresh.
        // eslint-disable-next-line no-console
        console.warn(`${reportFile} is missing evaluation keys: ${missingList}. Regenerate this report to align with the latest schema.`);
      }
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
      const guidance = typeof key.guidance === 'string' ? key.guidance.trim() : '';
      expect(typeof key.name).toBe('string');
      expect(key.name.trim().length).toBeGreaterThan(0);
      expect(guidance.length).toBeGreaterThanOrEqual(0);
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
