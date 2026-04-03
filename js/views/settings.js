import { getSetting, setSetting, exportAll, importAll, getAllUsers, createUser, resetUserPassword, deleteUser, changeUserRole } from '../db.js';
import { $, showToast, getToastLog, clearToastLog } from '../utils/helpers.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { validateApiKey, BILLING_URL } from '../api.js';
import { getAuthToken, getAuthUser, isAdmin } from '../utils/auth.js';
import { t, getLanguage, setLanguage } from '../i18n.js';

export async function render(container) {
  await ensureAuthenticated(container, () => renderSettings(container));
}

async function renderSettings(container) {
  const user = getAuthUser();
  const admin = isAdmin();
  const apiKey = admin ? (await getSetting('apiKey') || '') : '';

  container.innerHTML = `
    <div class="settings">
      <h1>${t('settings.title')}</h1>
      <p class="settings__hint">${t('settings.loggedInAs', escapeAttr(user.username || ''), user.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleUser'))}</p>

      ${admin ? `
      <section class="settings__section">
        <h2>${t('settings.apiKeySection')}</h2>
        <p class="settings__hint">${t('settings.apiKeyHint')}</p>
        <div class="form-group">
          <label for="apiKeyInput">${t('settings.apiKeyLabel')}</label>
          <input type="password" id="apiKeyInput" class="input" value="${escapeAttr(apiKey)}" placeholder="sk-ant-..." />
          <button class="btn btn--primary" id="btnSaveKey">${t('settings.apiKeySaveBtn')}</button>
        </div>
        <div class="settings__api-status" id="apiStatus"></div>
        <a href="${BILLING_URL}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm">${t('settings.apiKeyBilling')}</a>
      </section>
      ` : ''}

      <section class="settings__section">
        <h2>${t('settings.langSection')}</h2>
        <p class="settings__hint">${t('settings.langHint')}</p>
        <div class="lang-toggle" id="langToggle">
          <button class="btn btn--sm ${getLanguage() === 'de' ? 'btn--primary' : 'btn--ghost'}" data-lang="de">${t('settings.langDe')}</button>
          <button class="btn btn--sm ${getLanguage() === 'en' ? 'btn--primary' : 'btn--ghost'}" data-lang="en">${t('settings.langEn')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.passwordSection')}</h2>
        <p class="settings__hint">${t('settings.passwordHint')}</p>
        <div class="form-group">
          <label for="currentPassword">${t('settings.currentPassword')}</label>
          <input type="password" id="currentPassword" class="input" placeholder="${t('settings.currentPassword')}" />
        </div>
        <div class="form-group">
          <label for="newPassword">${t('settings.newPassword')}</label>
          <input type="password" id="newPassword" class="input" placeholder="${t('settings.newPassword')}" />
        </div>
        <div class="form-group">
          <label for="confirmPassword">${t('settings.confirmPassword')}</label>
          <input type="password" id="confirmPassword" class="input" placeholder="${t('settings.confirmPassword')}" />
          <button class="btn btn--primary" id="btnChangePw">${t('settings.changePasswordBtn')}</button>
        </div>
      </section>

      ${admin ? `
      <section class="settings__section">
        <h2>${t('settings.usersSection')}</h2>
        <p class="settings__hint">${t('settings.usersHint')}</p>
        <div class="user-mgmt" id="userList"></div>
        <button class="btn btn--primary" id="btnAddUser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${t('settings.addUserBtn')}
        </button>
        <div class="user-add-form hidden" id="addUserForm">
          <div class="form-group">
            <label for="newUsername">${t('settings.usernamePlaceholder')}</label>
            <input type="text" id="newUsername" class="input" placeholder="${t('settings.usernamePlaceholder')}" />
          </div>
          <div class="form-group">
            <label for="newUserPw">${t('settings.newPassword')}</label>
            <input type="password" id="newUserPw" class="input" placeholder="${t('settings.rolePwPlaceholder')}" />
          </div>
          <div class="form-group">
            <label for="newUserRole">${t('settings.roleLabel')}</label>
            <select id="newUserRole" class="select">
              <option value="user">${t('settings.roleUser')}</option>
              <option value="admin">${t('settings.roleAdmin')}</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--primary" id="btnConfirmAddUser">${t('settings.createUserBtn')}</button>
            <button class="btn btn--ghost" id="btnCancelAddUser">${t('settings.cancelBtn')}</button>
          </div>
        </div>
      </section>
      ` : ''}

      <section class="settings__section">
        <h2>${t('settings.backupSection')}</h2>
        <p class="settings__hint">${t('settings.backupHint')}</p>
        <div class="settings__actions">
          <button class="btn btn--primary" id="btnExport">${t('settings.exportBtn')}</button>
          ${admin ? `<label class="btn btn--secondary">
            ${t('settings.importBtn')}
            <input type="file" id="importFile" accept=".json" class="hidden" />
          </label>` : ''}
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.logSection')}</h2>
        <div class="toast-log" id="toastLog"></div>
        <button class="btn btn--ghost btn--sm" id="btnClearLog">${t('settings.logClearBtn')}</button>
      </section>

      <section class="settings__section">
        <h2>${t('settings.aboutSection')}</h2>
        <p>${t('settings.aboutDesc')}</p>
        <p><small>${t('settings.aboutDb')}</small></p>
      </section>
    </div>
  `;

  // --- Language toggle ---
  $('#langToggle', container).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    const lang = btn.dataset.lang;
    setLanguage(lang, { save: true, notify: false });
    // Persist to server
    try {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/auth/language', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ language: lang }),
        });
      }
    } catch { /* ignore */ }
    showToast(t('settings.langSaved'), 'success');
    // Re-render current view (settings) via navigate
    window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  });

  // --- API Key (admin only) ---
  if (admin) {
    $('#btnSaveKey', container).addEventListener('click', async () => {
      const key = $('#apiKeyInput', container).value.trim();
      if (!key) { showToast(t('settings.apiKeyRequired'), 'warning'); return; }
      const btn = $('#btnSaveKey', container);
      const statusEl = $('#apiStatus', container);
      btn.disabled = true;
      btn.textContent = t('settings.apiKeyChecking');
      statusEl.innerHTML = '';
      try {
        const result = await validateApiKey(key);
        if (!result.valid) {
          statusEl.innerHTML = `<span class="api-status api-status--error">${t('settings.apiKeyStatusInvalid')}</span>`;
          showToast(t('settings.apiKeyInvalid'), 'error');
          return;
        }
        await setSetting('apiKey', key);
        if (result.reason === 'no_credit') {
          statusEl.innerHTML = `<span class="api-status api-status--warning">${t('settings.apiKeyStatusNoCredit', BILLING_URL)}</span>`;
          showToast(t('settings.apiKeySavedNoCredit'), 'warning');
        } else {
          statusEl.innerHTML = `<span class="api-status api-status--ok">${t('settings.apiKeyStatusOk')}</span>`;
          showToast(t('settings.apiKeySavedOk'), 'success');
        }
      } catch (err) {
        await setSetting('apiKey', key);
        showToast(t('settings.apiKeySavedCheckFailed'), 'warning');
      } finally {
        btn.disabled = false;
        btn.textContent = t('settings.apiKeySaveBtn');
      }
    });
  }

  // --- Change own password ---
  $('#btnChangePw', container).addEventListener('click', async () => {
    const currentPw = $('#currentPassword', container).value;
    const newPw = $('#newPassword', container).value;
    const confirmPw = $('#confirmPassword', container).value;
    if (!newPw || newPw.length < 4) { showToast(t('settings.passwordTooShort'), 'warning'); return; }
    if (newPw !== confirmPw) { showToast(t('settings.passwordMismatch'), 'warning'); return; }
    try {
      const token = getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || t('settings.passwordFailed'), 'error');
        return;
      }
      showToast(t('settings.passwordChanged'), 'success');
      $('#currentPassword', container).value = '';
      $('#newPassword', container).value = '';
      $('#confirmPassword', container).value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // --- User management (admin only) ---
  if (admin) {
    await loadUserList(container);

    $('#btnAddUser', container).addEventListener('click', () => {
      $('#addUserForm', container).classList.remove('hidden');
      $('#btnAddUser', container).classList.add('hidden');
      $('#newUsername', container).focus();
    });

    $('#btnCancelAddUser', container).addEventListener('click', () => {
      $('#addUserForm', container).classList.add('hidden');
      $('#btnAddUser', container).classList.remove('hidden');
    });

    $('#btnConfirmAddUser', container).addEventListener('click', async () => {
      const username = $('#newUsername', container).value.trim();
      const password = $('#newUserPw', container).value;
      const role = $('#newUserRole', container).value;
      if (!username) { showToast(t('settings.usernameRequired'), 'warning'); return; }
      if (!password || password.length < 4) { showToast(t('settings.pwMinLength'), 'warning'); return; }
      try {
        await createUser(username, password, role);
        showToast(t('settings.userCreated', username), 'success');
        $('#newUsername', container).value = '';
        $('#newUserPw', container).value = '';
        $('#addUserForm', container).classList.add('hidden');
        $('#btnAddUser', container).classList.remove('hidden');
        await loadUserList(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // --- Export ---
  $('#btnExport', container).addEventListener('click', async () => {
    try {
      const data = await exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myrecipes-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('settings.backupDownloaded'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // --- Import (admin only) ---
  if (admin) {
    $('#importFile', container).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm(t('settings.importConfirm'))) { e.target.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.recipes || !data.settings) throw new Error('Invalid backup format.');
        await importAll(data);
        showToast(t('settings.backupImportedCount', data.recipes.length), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // --- Toast Log ---
  renderToastLog(container);
  $('#btnClearLog', container).addEventListener('click', () => {
    clearToastLog();
    renderToastLog(container);
    showToast(t('settings.logCleared'), 'success');
  });
}

async function loadUserList(container) {
  const currentUser = getAuthUser();
  try {
    const users = await getAllUsers();
    const list = $('#userList', container);
    if (!list) return;

    list.innerHTML = users.map(u => `
      <div class="user-row" data-user-id="${u.id}">
        <div class="user-row__info">
          <span class="user-row__name">${escapeAttr(u.username)}</span>
          <span class="user-row__role ${u.role === 'admin' ? 'user-row__role--admin' : ''}">${u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleUser')}</span>
          ${u.username === currentUser.username ? `<span class="user-row__you">${t('settings.youLabel')}</span>` : ''}
        </div>
        <div class="user-row__actions">
          <button class="btn btn--ghost btn--sm" data-action="reset-pw" data-id="${u.id}" title="${t('settings.resetPasswordBtn')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          ${u.username !== currentUser.username ? `<button class="btn btn--ghost btn--sm btn--danger-text" data-action="delete" data-id="${u.id}" title="${t('settings.deleteUserBtn')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>` : ''}
        </div>
        <div class="user-row__reset hidden" id="resetForm-${u.id}">
          <input type="password" class="input" placeholder="${t('settings.newPassword')}" id="resetPwInput-${u.id}" />
          <button class="btn btn--sm btn--primary" data-action="confirm-reset" data-id="${u.id}">${t('settings.setPwBtn')}</button>
          <button class="btn btn--sm btn--ghost" data-action="cancel-reset" data-id="${u.id}">${t('settings.cancelBtn')}</button>
        </div>
      </div>
    `).join('');

    // Delegate events
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      const action = btn.dataset.action;

      if (action === 'reset-pw') {
        list.querySelector(`#resetForm-${id}`)?.classList.remove('hidden');
        list.querySelector(`#resetPwInput-${id}`)?.focus();
      } else if (action === 'cancel-reset') {
        list.querySelector(`#resetForm-${id}`)?.classList.add('hidden');
      } else if (action === 'confirm-reset') {
        const pw = list.querySelector(`#resetPwInput-${id}`)?.value;
        if (!pw || pw.length < 4) { showToast(t('settings.pwMinLength'), 'warning'); return; }
        try {
          await resetUserPassword(id, pw);
          showToast(t('settings.passwordReset'), 'success');
          list.querySelector(`#resetForm-${id}`)?.classList.add('hidden');
        } catch (err) { showToast(err.message, 'error'); }
      } else if (action === 'delete') {
        const row = list.querySelector(`[data-user-id="${id}"]`);
        const name = row?.querySelector('.user-row__name')?.textContent || '';
        if (!confirm(t('settings.userDeleteConfirm', name))) return;
        try {
          await deleteUser(id);
          showToast(t('settings.userDeleted', name), 'success');
          await loadUserList(container);
        } catch (err) { showToast(err.message, 'error'); }
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderToastLog(container) {
  const logEl = $('#toastLog', container);
  const entries = getToastLog();
  if (entries.length === 0) {
    logEl.innerHTML = `<p class="toast-log__empty">${t('settings.logEmpty')}</p>`;
    return;
  }
  logEl.innerHTML = entries.slice().reverse().map(e => {
    const d = new Date(e.time);
    const time = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="toast-log__entry toast-log__entry--${escapeAttr(e.type)}">
      <span class="toast-log__time">${time}</span>
      <span class="toast-log__msg">${escapeAttr(e.message)}</span>
    </div>`;
  }).join('');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
