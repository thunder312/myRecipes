import { getSetting, setSetting, exportAll, importAll, getAllUsers, createUser, resetUserPassword, deleteUser, changeUserRole } from '../db.js';
import { $, showToast, getToastLog, clearToastLog } from '../utils/helpers.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { validateApiKey, BILLING_URL } from '../api.js';
import { getAuthToken, getAuthUser, isAdmin } from '../utils/auth.js';

export async function render(container) {
  await ensureAuthenticated(container, () => renderSettings(container));
}

async function renderSettings(container) {
  const user = getAuthUser();
  const admin = isAdmin();
  const apiKey = admin ? (await getSetting('apiKey') || '') : '';

  container.innerHTML = `
    <div class="settings">
      <h1>Einstellungen</h1>
      <p class="settings__hint">Angemeldet als: <strong>${escapeAttr(user.username || '')}</strong> (${user.role === 'admin' ? 'Administrator' : 'Benutzer'})</p>

      ${admin ? `
      <section class="settings__section">
        <h2>Anthropic API-Key</h2>
        <p class="settings__hint">Der API-Key wird auf dem Server gespeichert und nur für die Rezept-Analyse verwendet.</p>
        <div class="form-group">
          <label for="apiKeyInput">API-Key</label>
          <input type="password" id="apiKeyInput" class="input" value="${escapeAttr(apiKey)}" placeholder="sk-ant-..." />
          <button class="btn btn--primary" id="btnSaveKey">Speichern</button>
        </div>
        <div class="settings__api-status" id="apiStatus"></div>
        <a href="${BILLING_URL}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm">Guthaben &amp; Billing verwalten</a>
      </section>
      ` : ''}

      <section class="settings__section">
        <h2>Passwort ändern</h2>
        <p class="settings__hint">Ändere dein eigenes Passwort.</p>
        <div class="form-group">
          <label for="currentPassword">Aktuelles Passwort</label>
          <input type="password" id="currentPassword" class="input" placeholder="Aktuelles Passwort" />
        </div>
        <div class="form-group">
          <label for="newPassword">Neues Passwort</label>
          <input type="password" id="newPassword" class="input" placeholder="Neues Passwort" />
        </div>
        <div class="form-group">
          <label for="confirmPassword">Neues Passwort bestätigen</label>
          <input type="password" id="confirmPassword" class="input" placeholder="Passwort bestätigen" />
          <button class="btn btn--primary" id="btnChangePw">Passwort ändern</button>
        </div>
      </section>

      ${admin ? `
      <section class="settings__section">
        <h2>Benutzerverwaltung</h2>
        <p class="settings__hint">Verwalte den Zugang für Freunde und Familie.</p>
        <div class="user-mgmt" id="userList"></div>
        <button class="btn btn--primary" id="btnAddUser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neuen Benutzer anlegen
        </button>
        <div class="user-add-form hidden" id="addUserForm">
          <div class="form-group">
            <label for="newUsername">Benutzername</label>
            <input type="text" id="newUsername" class="input" placeholder="z. B. anna" />
          </div>
          <div class="form-group">
            <label for="newUserPw">Passwort</label>
            <input type="password" id="newUserPw" class="input" placeholder="Mindestens 4 Zeichen" />
          </div>
          <div class="form-group">
            <label for="newUserRole">Rolle</label>
            <select id="newUserRole" class="select">
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--primary" id="btnConfirmAddUser">Anlegen</button>
            <button class="btn btn--ghost" id="btnCancelAddUser">Abbrechen</button>
          </div>
        </div>
      </section>
      ` : ''}

      <section class="settings__section">
        <h2>Daten-Backup</h2>
        <p class="settings__hint">Exportiere oder importiere deine gesamte Rezeptsammlung als JSON-Datei.</p>
        <div class="settings__actions">
          <button class="btn btn--primary" id="btnExport">Datenbank exportieren</button>
          ${admin ? `<label class="btn btn--secondary">
            Datenbank importieren
            <input type="file" id="importFile" accept=".json" class="hidden" />
          </label>` : ''}
        </div>
      </section>

      <section class="settings__section">
        <h2>Benachrichtigungs-Log</h2>
        <p class="settings__hint">Die letzten 10 Meldungen zum Nachlesen.</p>
        <div class="toast-log" id="toastLog"></div>
        <button class="btn btn--ghost btn--sm" id="btnClearLog">Log leeren</button>
      </section>

      <section class="settings__section">
        <h2>Über myRecipes</h2>
        <p>Persönliche Rezeptsammlung mit KI-gestützter Kategorisierung.</p>
        <p><small>Deine Daten werden auf dem Server in einer SQLite-Datenbank gespeichert.</small></p>
      </section>
    </div>
  `;

  // --- API Key (admin only) ---
  if (admin) {
    $('#btnSaveKey', container).addEventListener('click', async () => {
      const key = $('#apiKeyInput', container).value.trim();
      if (!key) { showToast('Bitte API-Key eingeben.', 'warning'); return; }
      const btn = $('#btnSaveKey', container);
      const statusEl = $('#apiStatus', container);
      btn.disabled = true;
      btn.textContent = 'Wird geprüft...';
      statusEl.innerHTML = '';
      try {
        const result = await validateApiKey(key);
        if (!result.valid) {
          statusEl.innerHTML = '<span class="api-status api-status--error">Ungültiger API-Key</span>';
          showToast('API-Key ist ungültig.', 'error');
          return;
        }
        await setSetting('apiKey', key);
        if (result.reason === 'no_credit') {
          statusEl.innerHTML = `<span class="api-status api-status--warning">Key gültig, aber kein Guthaben. <a href="${BILLING_URL}" target="_blank" rel="noopener">Aufladen</a></span>`;
          showToast('API-Key gespeichert, aber kein Guthaben.', 'warning');
        } else {
          statusEl.innerHTML = '<span class="api-status api-status--ok">Key gültig und einsatzbereit</span>';
          showToast('API-Key gespeichert.', 'success');
        }
      } catch (err) {
        await setSetting('apiKey', key);
        showToast('API-Key gespeichert (Prüfung fehlgeschlagen).', 'warning');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Speichern';
      }
    });
  }

  // --- Change own password ---
  $('#btnChangePw', container).addEventListener('click', async () => {
    const currentPw = $('#currentPassword', container).value;
    const newPw = $('#newPassword', container).value;
    const confirmPw = $('#confirmPassword', container).value;
    if (!newPw || newPw.length < 4) { showToast('Neues Passwort muss mindestens 4 Zeichen haben.', 'warning'); return; }
    if (newPw !== confirmPw) { showToast('Neue Passwörter stimmen nicht überein.', 'warning'); return; }
    try {
      const token = getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Passwort-Änderung fehlgeschlagen.', 'error');
        return;
      }
      showToast('Passwort geändert.', 'success');
      $('#currentPassword', container).value = '';
      $('#newPassword', container).value = '';
      $('#confirmPassword', container).value = '';
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
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
      if (!username) { showToast('Benutzername eingeben.', 'warning'); return; }
      if (!password || password.length < 4) { showToast('Passwort muss mind. 4 Zeichen haben.', 'warning'); return; }
      try {
        await createUser(username, password, role);
        showToast(`Benutzer „${username}" angelegt.`, 'success');
        $('#newUsername', container).value = '';
        $('#newUserPw', container).value = '';
        $('#addUserForm', container).classList.add('hidden');
        $('#btnAddUser', container).classList.remove('hidden');
        await loadUserList(container);
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
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
      showToast('Backup heruntergeladen.', 'success');
    } catch (err) {
      showToast(`Export-Fehler: ${err.message}`, 'error');
    }
  });

  // --- Import (admin only) ---
  if (admin) {
    $('#importFile', container).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Achtung: Alle bestehenden Daten werden durch das Backup ersetzt. Fortfahren?')) { e.target.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.recipes || !data.settings) throw new Error('Ungültiges Backup-Format.');
        await importAll(data);
        showToast(`Backup importiert: ${data.recipes.length} Rezepte.`, 'success');
      } catch (err) {
        showToast(`Import-Fehler: ${err.message}`, 'error');
      }
    });
  }

  // --- Toast Log ---
  renderToastLog(container);
  $('#btnClearLog', container).addEventListener('click', () => {
    clearToastLog();
    renderToastLog(container);
    showToast('Log geleert.', 'success');
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
          <span class="user-row__role ${u.role === 'admin' ? 'user-row__role--admin' : ''}">${u.role === 'admin' ? 'Admin' : 'Benutzer'}</span>
          ${u.username === currentUser.username ? '<span class="user-row__you">(du)</span>' : ''}
        </div>
        <div class="user-row__actions">
          <button class="btn btn--ghost btn--sm" data-action="reset-pw" data-id="${u.id}" title="Passwort zurücksetzen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          ${u.username !== currentUser.username ? `<button class="btn btn--ghost btn--sm btn--danger-text" data-action="delete" data-id="${u.id}" title="Löschen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>` : ''}
        </div>
        <div class="user-row__reset hidden" id="resetForm-${u.id}">
          <input type="password" class="input" placeholder="Neues Passwort" id="resetPwInput-${u.id}" />
          <button class="btn btn--sm btn--primary" data-action="confirm-reset" data-id="${u.id}">Setzen</button>
          <button class="btn btn--sm btn--ghost" data-action="cancel-reset" data-id="${u.id}">Abbrechen</button>
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
        if (!pw || pw.length < 4) { showToast('Passwort muss mind. 4 Zeichen haben.', 'warning'); return; }
        try {
          await resetUserPassword(id, pw);
          showToast('Passwort zurückgesetzt.', 'success');
          list.querySelector(`#resetForm-${id}`)?.classList.add('hidden');
        } catch (err) { showToast(`Fehler: ${err.message}`, 'error'); }
      } else if (action === 'delete') {
        const row = list.querySelector(`[data-user-id="${id}"]`);
        const name = row?.querySelector('.user-row__name')?.textContent || '';
        if (!confirm(`Benutzer „${name}" wirklich löschen?`)) return;
        try {
          await deleteUser(id);
          showToast(`Benutzer „${name}" gelöscht.`, 'success');
          await loadUserList(container);
        } catch (err) { showToast(`Fehler: ${err.message}`, 'error'); }
      }
    });
  } catch (err) {
    showToast(`Fehler beim Laden der Benutzer: ${err.message}`, 'error');
  }
}

function renderToastLog(container) {
  const logEl = $('#toastLog', container);
  const entries = getToastLog();
  if (entries.length === 0) {
    logEl.innerHTML = '<p class="toast-log__empty">Keine Meldungen vorhanden.</p>';
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
