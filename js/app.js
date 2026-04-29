import { $, showToast } from './utils/helpers.js';
import { isAuthenticated, logout, getAuthUser, isAdmin, setAuthenticated } from './utils/auth.js';
import { ensureAuthenticated } from './utils/auth-ui.js';
import { t, getLanguage } from './i18n.js';

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
    showToast(t('settings.settingsAdminOnly'), 'error');
    return;
  }

  const loader = routes[viewName];
  if (!loader) {
    container.innerHTML = `<div class="error-state"><h2>404</h2><a href="#overview" class="btn">${t('overview.title')}</a></div>`;
    return;
  }

  try {
    const module = await loader();
    currentView = viewName;
    await module.render(container, ...params);
    updateNavLabels();
    updateNavForUser();
  } catch (err) {
    console.error('Navigation error:', err);
    container.innerHTML = `<div class="error-state"><h2>${t('common.error')}</h2><p>${err.message}</p></div>`;
  }
}

function updateNavLabels() {
  document.documentElement.lang = getLanguage();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated !== key) el.textContent = translated;
  });
  const logoutBtn = $('#btnLogout');
  if (logoutBtn) logoutBtn.title = t('nav.logout');
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
        <h2>${t('profile.title')}</h2>
        <button class="modal__close" id="btnCloseProfile" title="${t('common.close')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal__body modal__body--profile">
        <section class="profile-section">
          <h3 class="profile-section__title">${t('profile.usernameSection')}</h3>
          <input type="text" id="profileNewUsername" class="input" value="${escapeHtml(user.username || '')}" placeholder="${t('profile.usernamePlaceholder')}" />
          <input type="password" id="profilePwForUsername" class="input" placeholder="${t('profile.currentPwPlaceholder')}" />
          <button class="btn btn--primary btn--sm" id="btnSaveUsername">${t('profile.saveBtn')}</button>
        </section>
        <section class="profile-section">
          <h3 class="profile-section__title">${t('profile.passwordSection')}</h3>
          <input type="password" id="profileCurrentPw" class="input" placeholder="${t('profile.currentPw')}" />
          <input type="password" id="profileNewPw" class="input" placeholder="${t('profile.newPw')}" />
          <input type="password" id="profileConfirmPw" class="input" placeholder="${t('profile.confirmPw')}" />
          <button class="btn btn--primary btn--sm" id="btnSavePassword">${t('profile.saveBtn')}</button>
        </section>
      </div>
      <div class="profile-modal__logout">
        <button class="btn btn--ghost btn--danger-text" id="btnProfileLogout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          ${t('profile.logoutBtn')}
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
    showToast(t('profile.loggedOut'), 'success');
    updateNavForUser();
    navigate();
  });

  document.getElementById('btnSaveUsername').addEventListener('click', async () => {
    const newUsername = document.getElementById('profileNewUsername').value.trim();
    const pw = document.getElementById('profilePwForUsername').value;
    if (!newUsername) { showToast(t('profile.usernameEmpty'), 'warning'); return; }
    if (!pw) { showToast(t('profile.currentPwRequired'), 'warning'); return; }
    try {
      const { getAuthToken } = await import('./utils/auth.js');
      const res = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ newUsername, currentPassword: pw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || t('profile.saveError'), 'error');
        return;
      }
      const data = await res.json();
      setAuthenticated(data.token, data.username, getAuthUser().role);
      showToast(t('profile.usernameSaved'), 'success');
      updateNavForUser();
      modal.remove();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('btnSavePassword').addEventListener('click', async () => {
    const currentPw = document.getElementById('profileCurrentPw').value;
    const newPw = document.getElementById('profileNewPw').value;
    const confirmPw = document.getElementById('profileConfirmPw').value;
    if (!newPw || newPw.length < 4) { showToast(t('profile.passwordTooShort'), 'warning'); return; }
    if (newPw !== confirmPw) { showToast(t('profile.passwordMismatch'), 'warning'); return; }
    try {
      const { getAuthToken } = await import('./utils/auth.js');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || t('profile.passwordFailed'), 'error');
        return;
      }
      showToast(t('profile.passwordSaved'), 'success');
      modal.remove();
    } catch (err) {
      showToast(err.message, 'error');
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
      showToast(t('profile.loggedOut'), 'success');
      updateNavForUser();
      navigate();
    });
  }

  const profileBtn = $('#btnProfile');
  if (profileBtn) {
    profileBtn.addEventListener('click', openProfileModal);
  }

  // Re-render current view when language changes
  window.addEventListener('langchange', () => {
    updateNavLabels();
    navigate();
  });

  updateNavLabels();
  navigate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
