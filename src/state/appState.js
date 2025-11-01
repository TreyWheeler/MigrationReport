const appState = {
  countries: [],
  selected: [],
  nodesByFile: new Map(),
  showCitiesOnly: false,
  expandedState: {},
  showHiddenKeys: false,
  keyGuidanceIndex: new Map(),
  keyGuidanceHasRatings: false,
  focusedCategory: null,
};

const keyGuidanceDialogState = { lastTrigger: null };

const keyActionsMenuState = { current: null, listenersAttached: false };

function resetKeyActionsMenuState() {
  keyActionsMenuState.current = null;
}

function clearCachedMetrics() {
  const clearMetricsOnNode = (node) => {
    if (node && typeof node === 'object' && 'metrics' in node) {
      delete node.metrics;
    }
  };
  if (Array.isArray(appState.countries)) {
    appState.countries.forEach(country => {
      clearMetricsOnNode(country);
      if (country && Array.isArray(country.cities)) {
        country.cities.forEach(city => clearMetricsOnNode(city));
      }
    });
  }
  if (Array.isArray(appState.selected)) {
    appState.selected.forEach(node => clearMetricsOnNode(node));
  }
}

export {
  appState,
  keyGuidanceDialogState,
  keyActionsMenuState,
  resetKeyActionsMenuState,
  clearCachedMetrics,
};
