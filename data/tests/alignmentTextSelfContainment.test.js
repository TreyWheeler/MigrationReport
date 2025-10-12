const fs = require('fs');
const path = require('path');

const reportsDir = path.resolve(__dirname, '..', '..', 'reports');
const metricReferencePattern = /\bat \d+\/10/;

describe('Alignment text self-containment', () => {
  const reportFiles = fs.readdirSync(reportsDir).filter(name => name.endsWith('_report.json'));

  reportFiles.forEach(reportFile => {
    test(`${reportFile} alignment text avoids metric references`, () => {
      const reportPath = path.join(reportsDir, reportFile);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

      const issues = [];

      report.values.forEach(entry => {
        if (typeof entry.alignmentText !== 'string') {
          return;
        }

        if (metricReferencePattern.test(entry.alignmentText)) {
          issues.push(`${entry.key}: ${entry.alignmentText}`);
        }
      });

      if (issues.length > 0) {
        throw new Error(`Found metric references in alignment text:\n${issues.join('\n')}`);
      }
    });
  });
});
