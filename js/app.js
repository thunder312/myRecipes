import { $, showToast } from './utils/helpers.js';
import { isImportRunning } from './utils/auth.js';

const routes = {
  overview: () => import('./views/overview.js'),
  detail: () => import('./views/detail.js'),
  suggest: () => import('./views/suggest.js'),
  import: () => import('./views/import-view.js'),
  settings: () => import('./views/settings.js')
};

let currentView = null;

async function navigate() {
  const hash = window.location.hash.slice(1) || 'overview';
  const [viewName, ...params] = hash.split('/');

  // Block navigation away from import while an import is running
  if (isImportRunning() && viewName !== 'import') {
    showToast('Navigation blockiert – Import läuft noch.', 'warning');
    window.location.hash = '#import';
    return;
  }

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
  } catch (err) {
    console.error('Navigation error:', err);
    container.innerHTML = `<div class="error-state"><h2>Fehler</h2><p>${err.message}</p></div>`;
  }
}

function init() {
  window.addEventListener('hashchange', navigate);
  navigate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
