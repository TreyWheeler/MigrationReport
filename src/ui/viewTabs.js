import { getStored, setStored } from '../storage/preferences.js';

function setActiveView(viewId) {
  if (typeof document === 'undefined') return;
  const views = Array.from(document.querySelectorAll('.view-pane'));
  const tabs = Array.from(document.querySelectorAll('[data-view-tab]'));
  const availableIds = new Set(tabs.map(tab => tab?.dataset?.viewTab).filter(Boolean));
  if (!availableIds.has(viewId)) return;
  views.forEach(view => {
    const isActive = view && view.id === viewId;
    view.classList.toggle('is-active', isActive);
    view.toggleAttribute('hidden', !isActive);
    view.setAttribute('aria-hidden', (!isActive).toString());
    view.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  tabs.forEach(tab => {
    const isMatch = tab?.dataset?.viewTab === viewId;
    tab.classList.toggle('is-active', isMatch);
    tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    tab.setAttribute('tabindex', isMatch ? '0' : '-1');
  });
  setStored('activeViewTab', viewId);
}

function setupViewTabs() {
  if (typeof document === 'undefined') return;
  const tabs = Array.from(document.querySelectorAll('[data-view-tab]'));
  if (tabs.length === 0) return;
  const storedView = getStored('activeViewTab', null);
  const available = new Set(tabs.map(tab => tab?.dataset?.viewTab).filter(Boolean));
  const initial = tabs.find(tab => tab.classList.contains('is-active')) || tabs[0];
  const initialView = initial?.dataset?.viewTab;
  const targetView = (storedView && available.has(storedView)) ? storedView : initialView;
  if (targetView) {
    setActiveView(targetView);
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset?.viewTab) {
        setActiveView(tab.dataset.viewTab);
      }
    });
  });
}

export { setActiveView, setupViewTabs };

export default { setActiveView, setupViewTabs };
