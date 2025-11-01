const indicatorEl = typeof document !== 'undefined'
  ? document.getElementById('appLoadingIndicator')
  : null;

const indicatorLabelEl = indicatorEl
  ? indicatorEl.querySelector('.app-loading__label')
  : null;

export function showLoadingIndicator(message = 'Loading report data…') {
  if (!indicatorEl) return;
  indicatorEl.classList.remove('app-loading--hidden', 'app-loading--error');
  indicatorEl.removeAttribute('aria-hidden');
  if (indicatorLabelEl && message) {
    indicatorLabelEl.textContent = message;
  }
}

export function showLoadingError(message = 'We were unable to load the Migration Report.') {
  if (!indicatorEl) return;
  indicatorEl.classList.remove('app-loading--hidden');
  indicatorEl.classList.add('app-loading--error');
  indicatorEl.removeAttribute('aria-hidden');
  if (indicatorLabelEl && message) {
    indicatorLabelEl.textContent = message;
  }
}

export function hideLoadingIndicator() {
  if (!indicatorEl) return;
  indicatorEl.classList.add('app-loading--hidden');
  indicatorEl.setAttribute('aria-hidden', 'true');
}
