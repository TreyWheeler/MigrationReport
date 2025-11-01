const indicatorEl = typeof document !== 'undefined'
  ? document.getElementById('appLoadingIndicator')
  : null;

const indicatorLabelEl = indicatorEl
  ? indicatorEl.querySelector('.app-loading__label')
  : null;

const HIDE_TRANSITION_MS = 160;
let hideTimer = null;

export function waitForLoadingIndicatorFrame() {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      if (
        typeof window !== 'undefined'
        && typeof window.requestAnimationFrame === 'function'
      ) {
        window.requestAnimationFrame(() => {
          setTimeout(finish, 0);
        });
        setTimeout(finish, 0);
        return;
      }
    } catch {}
    setTimeout(finish, 0);
  });
}

export function showLoadingIndicator(message = 'Loading report data…') {
  if (!indicatorEl) return;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  indicatorEl.classList.remove('app-loading--hidden', 'app-loading--error');
  indicatorEl.classList.add('app-loading--visible');
  indicatorEl.removeAttribute('aria-hidden');
  if (indicatorLabelEl && message) {
    indicatorLabelEl.textContent = message;
  }
}

export function showLoadingError(message = 'We were unable to load the Migration Report.') {
  if (!indicatorEl) return;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  indicatorEl.classList.remove('app-loading--hidden');
  indicatorEl.classList.add('app-loading--visible', 'app-loading--error');
  indicatorEl.removeAttribute('aria-hidden');
  if (indicatorLabelEl && message) {
    indicatorLabelEl.textContent = message;
  }
}

export function hideLoadingIndicator() {
  if (!indicatorEl) return;
  indicatorEl.classList.remove('app-loading--error', 'app-loading--visible');
  indicatorEl.classList.add('app-loading--hidden');
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  const prefersReducedMotion = (() => {
    try {
      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();
  if (prefersReducedMotion) {
    indicatorEl.setAttribute('aria-hidden', 'true');
    hideTimer = null;
    return;
  }
  hideTimer = setTimeout(() => {
    indicatorEl.setAttribute('aria-hidden', 'true');
    hideTimer = null;
  }, HIDE_TRANSITION_MS);
}
