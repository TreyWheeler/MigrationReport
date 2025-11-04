import MigrationReportAPI from '../script.js';

if (!MigrationReportAPI || typeof MigrationReportAPI !== 'object') {
  throw new Error('MigrationReport runtime did not provide an API surface.');
}

const {
  appState,
  renderEmptyReportState,
  saveSelectedToStorage,
  loadSelectedFromStorage,
  updateCollapseCountriesButton,
  fetchJsonAsset,
  sortByOrderThenName,
  loadMain,
  renderComparison,
  getStored,
  setStored,
  fetchCountry,
  clearCountryCache,
  computeRoundedMetrics,
  computeCountryScoresForSorting,
  applyHiddenKeysVisibility,
  toggleHiddenKeysVisibility,
  openKeyGuidanceDialog,
} = MigrationReportAPI;

if (typeof window !== 'undefined') {
  window.MigrationReport = MigrationReportAPI;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__MIGRATION_REPORT_DISABLE_AUTOLOAD__) {
  const start = () => {
    try {
      loadMain();
    } catch (error) {
      console.error('Failed to bootstrap Migration Report UI', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

export {
  appState,
  renderEmptyReportState,
  saveSelectedToStorage,
  loadSelectedFromStorage,
  updateCollapseCountriesButton,
  fetchJsonAsset,
  sortByOrderThenName,
  loadMain,
  renderComparison,
  getStored,
  setStored,
  fetchCountry,
  clearCountryCache,
  computeRoundedMetrics,
  computeCountryScoresForSorting,
  applyHiddenKeysVisibility,
  toggleHiddenKeysVisibility,
  openKeyGuidanceDialog,
};

export default MigrationReportAPI;
