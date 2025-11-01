import fs from 'fs';
import path from 'path';

const rootDir = path.resolve('.');
const reportsDir = path.join(rootDir, 'reports');
const countriesPath = path.join(rootDir, 'data', 'countries.json');
const citiesPath = path.join(rootDir, 'data', 'cities.json');

const countries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

const reportNameMap = new Map();
for (const country of countries.countries || []) {
  reportNameMap.set(path.normalize(country.report), country.name);
}
for (const city of cities.cities || []) {
  reportNameMap.set(path.normalize(city.report), city.name);
}

function toTitleCase(input) {
  return input
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const establishedKeys = [
  {
    key: 'Hiring Velocity (Established Studios)',
    buildText: ({ locationName, establishedText, establishedValueDescription }) =>
      `As noted in Game Dev Work Prospects, ${establishedText} Hiring velocity at established studios in ${locationName} ${establishedValueDescription}.`
  },
  {
    key: 'Compensation Benchmark (Established Studios)',
    buildText: ({ locationName, compensationDescription }) =>
      `${compensationDescription} When opportunities surface in ${locationName}, established studios benchmark offers against peers across the ecosystem.`
  },
  {
    key: 'Language (Established Studios)',
    buildText: ({ locationName }) =>
      `Established studios in ${locationName} rely on English for cross-border collaboration, while local-language fluency remains important for community, compliance, and platform partnerships.`
  },
  {
    key: 'Remote Expectations (Established Studios)',
    buildText: ({ locationName, remoteDescription }) =>
      `Remote expectations at established studios in ${locationName} ${remoteDescription}.`
  }
];

const startupKeys = [
  {
    key: 'Hiring Velocity (Startups)',
    buildText: ({ locationName, startupText, startupValueDescription }) =>
      `Startup founders report that ${startupText} Hiring velocity at early-stage studios in ${locationName} ${startupValueDescription}.`
  },
  {
    key: 'Compensation Benchmark (Startups)',
    buildText: ({ locationName, startupCompensationDescription }) =>
      `${startupCompensationDescription} Early teams in ${locationName} balance cash and equity to stay competitive while managing runway.`
  },
  {
    key: 'Language (Startups)',
    buildText: ({ locationName }) =>
      `Founding teams in ${locationName} lean on English for investor and platform communication, while local-language fluency helps with hiring, compliance, and community outreach.`
  },
  {
    key: 'Remote Expectations (Startups)',
    buildText: ({ locationName, startupRemoteDescription }) =>
      `Remote expectations among startups in ${locationName} ${startupRemoteDescription}.`
  }
];

function describeTempo(value) {
  if (value >= 9) return 'moves quickly, often closing offers within a few weeks';
  if (value >= 7) return 'wraps searches within a month or two as pipelines stay active';
  if (value >= 5) return 'is moderate, with teams needing a few months to land the right hire';
  if (value >= 3) return 'is slow, with hiring cycles stretching several months or pausing until budgets free up';
  return 'is exceptionally slow, with roles frequently on hold or reliant on remote talent';
}

function describeCompensation(value) {
  if (value >= 9) return 'Compensation lands at the top of global ranges with premium base pay, bonuses, and stock.';
  if (value >= 7) return 'Compensation remains competitive with other major hubs, mixing solid base pay and performance bonuses.';
  if (value >= 5) return 'Compensation clusters around global medians, requiring negotiation to balance cost of living.';
  if (value >= 3) return 'Compensation trails larger hubs, so candidates leverage remote offers or equity to bridge gaps.';
  return 'Compensation lags global peers, pushing candidates to consider remote packages or supplemental income.';
}

function describeRemote(value) {
  if (value >= 9) return 'are highly flexible, with distributed teams normalized and relocation optional';
  if (value >= 7) return 'are flexible for senior roles, with hybrid schedules common';
  if (value >= 5) return 'are mixed—teams juggle on-site collaboration with hybrid arrangements when possible';
  if (value >= 3) return 'favor on-site work, offering limited hybrid options outside key leadership roles';
  return 'require on-site presence, with remote collaboration rarely supported';
}

function sanitizeValue(value, fallback = 1) {
  if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
    return Math.max(-1, Math.min(10, value));
  }
  return fallback;
}

function buildContext({ locationName, establishedEntry, startupEntry }) {
  const establishedValue = sanitizeValue(establishedEntry?.alignmentValue ?? 1);
  const startupValue = sanitizeValue(startupEntry?.alignmentValue ?? 1);

  const establishedText = establishedEntry?.alignmentText?.trim() || 'the ecosystem remains consistent.';
  const startupText = startupEntry?.alignmentText?.trim() || 'local support programs remain limited.';

  return {
    locationName,
    establishedValue,
    startupValue,
    establishedText,
    startupText,
    establishedValueDescription: describeTempo(establishedValue),
    startupValueDescription: describeTempo(startupValue),
    compensationDescription: describeCompensation(establishedValue),
    startupCompensationDescription: describeCompensation(startupValue),
    remoteDescription: describeRemote(establishedValue),
    startupRemoteDescription: describeRemote(startupValue)
  };
}

function ensureEntries(report, baseEntry, definitions, context, { inherit } = {}) {
  if (!baseEntry) return false;

  let changed = false;
  const entriesToInsert = [];

  for (const def of definitions) {
    const index = report.values.findIndex(entry => entry.key === def.key);
    const entry = index !== -1 ? report.values.splice(index, 1)[0] : { key: def.key };
    entry.key = def.key;

    if (inherit) {
      if (!entry.sameAsParent || 'alignmentValue' in entry || 'alignmentText' in entry) {
        changed = true;
      }
      entry.sameAsParent = true;
      delete entry.alignmentValue;
      delete entry.alignmentText;
    } else {
      const alignmentValue = def.key.includes('Established') ? context.establishedValue : context.startupValue;
      const alignmentText = def.buildText(context);

      if (entry.alignmentValue !== alignmentValue || entry.alignmentText !== alignmentText || entry.sameAsParent || index === -1) {
        changed = true;
      }

      entry.alignmentValue = alignmentValue;
      entry.alignmentText = alignmentText;
      delete entry.sameAsParent;
    }

    entriesToInsert.push(entry);
  }

  const baseIndex = report.values.indexOf(baseEntry);
  const insertIndexStart = baseIndex >= 0 ? baseIndex + 1 : report.values.length;

  report.values.splice(insertIndexStart, 0, ...entriesToInsert);

  return changed;
}

const files = fs.readdirSync(reportsDir).filter(name => name.endsWith('_report.json'));
let updatedCount = 0;

for (const file of files) {
  const reportPath = path.join(reportsDir, file);
  const relativeReportPath = path.join('reports', file);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  if (!Array.isArray(report.values)) continue;

  const establishedEntry = report.values.find(entry => entry.key === 'Game Dev Work Prospects');
  const startupEntry = report.values.find(entry => entry.key === 'Opportunities for Video Game Startup');

  if (!establishedEntry && !startupEntry) continue;

  const locationName = reportNameMap.get(path.normalize(relativeReportPath)) || toTitleCase(file.replace(/_report\.json$/i, ''));
  const context = buildContext({ locationName, establishedEntry, startupEntry });

  let changed = false;

  if (establishedEntry) {
    const establishedChanged = ensureEntries(
      report,
      establishedEntry,
      establishedKeys,
      context,
      { inherit: establishedEntry.sameAsParent === true }
    );
    changed = changed || establishedChanged;
  }

  if (startupEntry) {
    const startupChanged = ensureEntries(
      report,
      startupEntry,
      startupKeys,
      context,
      { inherit: startupEntry.sameAsParent === true }
    );
    changed = changed || startupChanged;
  }

  if (changed) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    updatedCount += 1;
  }
}

console.log(`Updated ${updatedCount} reports with game ecosystem detail keys.`);
