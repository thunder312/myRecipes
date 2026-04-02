import { $, showToast } from './utils/helpers.js';
import { isAuthenticated, logout, getAuthUser, isAdmin, setAuthenticated } from './utils/auth.js';
import { ensureAuthenticated } from './utils/auth-ui.js';

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

  updateNavForUser();

  // Update active nav
  document.querySelectorAll('.nav__link').forEach(link => {
    link.classList.toggle('nav__link--active', link.getAttribute('href') === `#${viewName}`);
  });

  if (!isAuthenticated()) {
    await ensureAuthenticated(container, navigate);
    return;
  }

  // Block settings for non-admins
  if (viewName === 'settings' && !isAdmin()) {
    window.location.hash = '#overview';
    showToast('Einstellungen sind nur für Administratoren zugänglich.', 'error');
    return;
  }

  const loader = routes[viewName];
  if (!loader) {
    container.innerHTML = '<div class="error-state"><h2>Seite nicht gefunden</h2><a href="#overview" class="btn">Zur Übersicht</a></div>';
    return;
  }

  try {
    const module = await loader();
    currentView = viewName;
    await module.render(container, ...params);
    updateNavForUser();
  } catch (err) {
    console.error('Navigation error:', err);
    container.innerHTML = `<div class="error-state"><h2>Fehler</h2><p>${err.message}</p></div>`;
  }
}

function updateNavForUser() {
  const loggedIn = isAuthenticated();
  const admin = isAdmin();

  const nav = document.querySelector('.nav');
  if (nav) nav.classList.toggle('hidden', !loggedIn);

  const logoutBtn = $('#btnLogout');
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !loggedIn);
    if (loggedIn) {
      const user = getAuthUser();
      const nameEl = logoutBtn.querySelector('.nav__logout-user');
      if (nameEl) nameEl.textContent = user.username || '';
    }
  }

  const profileBtn = $('#btnProfile');
  if (profileBtn) profileBtn.classList.toggle('hidden', !loggedIn);

  const settingsLink = $('#navSettings');
  if (settingsLink) settingsLink.classList.toggle('hidden', !admin);
}

function openProfileModal() {
  const existing = document.getElementById('profileModal');
  if (existing) existing.remove();

  const user = getAuthUser();
  const modal = document.createElement('div');
  modal.id = 'profileModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box">
      <div class="modal__header">
        <h2>Mein Profil</h2>
        <button class="modal__close" id="btnCloseProfile" title="Schließen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal__body modal__body--profile">
        <section class="profile-section">
          <h3 class="profile-section__title">Benutzername</h3>
          <input type="text" id="profileNewUsername" class="input" value="${escapeHtml(user.username || '')}" placeholder="Benutzername" />
          <input type="password" id="profilePwForUsername" class="input" placeholder="Aktuelles Passwort zur Bestätigung" />
          <button class="btn btn--primary btn--sm" id="btnSaveUsername">Speichern</button>
        </section>
        <section class="profile-section">
          <h3 class="profile-section__title">Passwort</h3>
          <input type="password" id="profileCurrentPw" class="input" placeholder="Aktuelles Passwort" />
          <input type="password" id="profileNewPw" class="input" placeholder="Neues Passwort" />
          <input type="password" id="profileConfirmPw" class="input" placeholder="Neues Passwort bestätigen" />
          <button class="btn btn--primary btn--sm" id="btnSavePassword">Speichern</button>
        </section>
      </div>
      <div class="profile-modal__logout">
        <button class="btn btn--ghost btn--danger-text" id="btnProfileLogout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Abmelden
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.modal__backdrop').addEventListener('click', () => modal.remove());
  document.getElementById('btnCloseProfile').addEventListener('click', () => modal.remove());
  document.getElementById('btnProfileLogout').addEventListener('click', () => {
    modal.remove();
    logout();
    showToast('Abgemeldet.', 'success');
    updateNavForUser();
    navigate();
  });

  document.getElementById('btnSaveUsername').addEventListener('click', async () => {
    const newUsername = document.getElementById('profileNewUsername').value.trim();
    const pw = document.getElementById('profilePwForUsername').value;
    if (!newUsername) { showToast('Benutzername darf nicht leer sein.', 'warning'); return; }
    if (!pw) { showToast('Bitte aktuelles Passwort eingeben.', 'warning'); return; }
    try {
      const { getAuthToken } = await import('./utils/auth.js');
      const res = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ newUsername, currentPassword: pw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Fehler beim Speichern.', 'error');
        return;
      }
      const data = await res.json();
      setAuthenticated(data.token, data.username, getAuthUser().role);
      showToast('Benutzername geändert.', 'success');
      updateNavForUser();
      modal.remove();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  });

  document.getElementById('btnSavePassword').addEventListener('click', async () => {
    const currentPw = document.getElementById('profileCurrentPw').value;
    const newPw = document.getElementById('profileNewPw').value;
    const confirmPw = document.getElementById('profileConfirmPw').value;
    if (!newPw || newPw.length < 4) { showToast('Neues Passwort muss mindestens 4 Zeichen haben.', 'warning'); return; }
    if (newPw !== confirmPw) { showToast('Passwörter stimmen nicht überein.', 'warning'); return; }
    try {
      const { getAuthToken } = await import('./utils/auth.js');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Passwort-Änderung fehlgeschlagen.', 'error');
        return;
      }
      showToast('Passwort geändert.', 'success');
      modal.remove();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function init() {
  window.addEventListener('hashchange', navigate);

  const logoutBtn = $('#btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      showToast('Abgemeldet.', 'success');
      updateNavForUser();
      navigate();
    });
  }

  const profileBtn = $('#btnProfile');
  if (profileBtn) {
    profileBtn.addEventListener('click', openProfileModal);
  }

  navigate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
