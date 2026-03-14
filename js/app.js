import { $, showToast } from './utils/helpers.js';
import { isAuthenticated, logout } from './utils/auth.js';

const routes = {
  overview: () => import('./views/overview.js'),
  detail: () => import('./views/detail.js'),
  suggest: () => import('./views/suggest.js'),
  import: () => import('./views/import-view.js'),
  settings: () => import('./views/settings.js'),
  cookbooks: () => import('./views/cookbooks.js'),
};

let currentView = null;

async function navigate() {
  const hash = window.location.hash.slice(1) || 'overview';
  const [viewName, ...params] = hash.split('/');

  const container = $('#app-content');
  if (!container) return;

  // Update active nav
  document.querySelectorAll('.nav__link').forEach(link => {
    link.classList.toggle('nav__link--active', link.getAttribute('href') === `#${viewName}`);
  });

  const loader = routes[viewName];
  if (!loader) {
    container.innerHTML = '<div class="error-state"><h2>Seite nicht gefunden</h2><a href="#overview" class="btn">Zur Übersicht</a></div>';
    return;
  }

  try {
    const module = await loader();
    currentView = viewName;
    await module.render(container, ...params);
    updateLogoutButton();
  } catch (err) {
    console.error('Navigation error:', err);
    container.innerHTML = `<div class="error-state"><h2>Fehler</h2><p>${err.message}</p></div>`;
  }
}

function updateLogoutButton() {
  const btn = $('#btnLogout');
  if (!btn) return;
  btn.classList.toggle('hidden', !isAuthenticated());
}

function init() {
  window.addEventListener('hashchange', navigate);

  const logoutBtn = $('#btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      showToast('Abgemeldet.', 'success');
      updateLogoutButton();
      // Re-render current view so auth-protected views show login
      navigate();
    });
  }

  navigate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
