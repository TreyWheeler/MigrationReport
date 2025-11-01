import { keyActionsMenuState } from './appState.js';

function getKeyActionsCell(instance) {
  if (!instance) return null;
  if (instance.cell && instance.cell.isConnected) return instance.cell;
  if (instance.wrap && typeof instance.wrap.closest === 'function') {
    const cell = instance.wrap.closest('td');
    if (cell instanceof HTMLElement) {
      instance.cell = cell;
      return cell;
    }
  }
  return null;
}

function closeKeyActionsMenu(instance) {
  const target = instance || keyActionsMenuState.current;
  if (!target) return;
  if (target.menu) target.menu.hidden = true;
  if (target.toggle) target.toggle.setAttribute('aria-expanded', 'false');
  const cell = getKeyActionsCell(target);
  if (cell) cell.classList.remove('key-actions-open');
  if (keyActionsMenuState.current === target) {
    keyActionsMenuState.current = null;
  }
}

function openKeyActionsMenu(instance) {
  if (!instance) return;
  if (keyActionsMenuState.current && keyActionsMenuState.current !== instance) {
    closeKeyActionsMenu(keyActionsMenuState.current);
  }
  if (instance.menu) instance.menu.hidden = false;
  if (instance.toggle) instance.toggle.setAttribute('aria-expanded', 'true');
  const cell = getKeyActionsCell(instance);
  if (cell) cell.classList.add('key-actions-open');
  keyActionsMenuState.current = instance;
}

function ensureKeyActionsMenuListeners() {
  if (keyActionsMenuState.listenersAttached || typeof document === 'undefined') return;
  document.addEventListener('click', (event) => {
    const current = keyActionsMenuState.current;
    if (!current) return;
    try {
      if (current.wrap && current.wrap.contains(event.target)) return;
    } catch {}
    closeKeyActionsMenu(current);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeKeyActionsMenu();
    }
  });
  keyActionsMenuState.listenersAttached = true;
}

function makeKeyActionsMenu(buttons) {
  const instance = {};
  const wrap = document.createElement('div');
  wrap.className = 'key-actions';
  instance.wrap = wrap;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'key-actions-toggle';
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Key actions');
  toggle.title = 'Key actions';
  toggle.innerHTML = '<span aria-hidden="true">⋮</span><span class="visually-hidden">Key actions</span>';
  instance.toggle = toggle;

  const menu = document.createElement('div');
  menu.className = 'key-actions-menu';
  menu.hidden = true;
  instance.menu = menu;

  const safeButtons = Array.isArray(buttons) ? buttons : [];
  safeButtons.forEach(btn => {
    if (!(btn instanceof HTMLElement)) return;
    btn.classList.add('key-actions-menu-item');
    btn.addEventListener('click', () => {
      closeKeyActionsMenu(instance);
    });
    menu.appendChild(btn);
  });

  wrap.appendChild(toggle);
  wrap.appendChild(menu);

  ensureKeyActionsMenuListeners();

  toggle.addEventListener('click', (event) => {
    try { event.preventDefault(); event.stopPropagation(); } catch {}
    if (keyActionsMenuState.current === instance) {
      closeKeyActionsMenu(instance);
    } else {
      openKeyActionsMenu(instance);
    }
  });

  menu.addEventListener('click', (event) => {
    try { event.stopPropagation(); } catch {}
  });

  return wrap;
}

export { closeKeyActionsMenu, openKeyActionsMenu, makeKeyActionsMenu };
