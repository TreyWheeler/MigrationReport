const appState = {
  countries: [],
  selected: [],
  nodesByFile: new Map(),
  showCitiesOnly: false,
  expandedState: {},
  showHiddenKeys: false,
  keyGuidanceIndex: new Map(),
  keyGuidanceHasRatings: false,
};

const keyGuidanceDialogState = { lastTrigger: null };

const keyActionsMenuState = { current: null, listenersAttached: false };

function resetKeyActionsMenuState() {
  keyActionsMenuState.current = null;
}

export {
  appState,
  keyGuidanceDialogState,
  keyActionsMenuState,
  resetKeyActionsMenuState,
};
