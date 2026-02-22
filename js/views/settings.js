import { getSetting, setSetting, exportAll, importAll } from '../db.js';
import { $, showToast, getToastLog, clearToastLog } from '../utils/helpers.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { validateApiKey, BILLING_URL } from '../api.js';
import { getAuthToken } from '../utils/auth.js';

export async function render(container) {
  await ensureAuthenticated(container, () => renderSettings(container));
}

async function renderSettings(container) {
  const apiKey = await getSetting('apiKey') || '';

  container.innerHTML = `
    <div class="settings">
      <h1>Einstellungen</h1>

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

      <section class="settings__section">
        <h2>Master-Passwort ändern</h2>
        <p class="settings__hint">Ändere das Passwort, das Import und Einstellungen schützt.</p>
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

      <section class="settings__section">
        <h2>Daten-Backup</h2>
        <p class="settings__hint">Exportiere oder importiere deine gesamte Rezeptsammlung als JSON-Datei.</p>
        <div class="settings__actions">
          <button class="btn btn--primary" id="btnExport">Datenbank exportieren</button>
          <label class="btn btn--secondary">
            Datenbank importieren
            <input type="file" id="importFile" accept=".json" class="hidden" />
          </label>
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

  // Save API Key with validation
  $('#btnSaveKey', container).addEventListener('click', async () => {
    const key = $('#apiKeyInput', container).value.trim();
    if (!key) {
      showToast('Bitte API-Key eingeben.', 'warning');
      return;
    }

    const btn = $('#btnSaveKey', container);
    const statusEl = $('#apiStatus', container);
    btn.disabled = true;
    btn.textContent = 'Wird geprüft...';
    statusEl.innerHTML = '';

    try {
      const result = await validateApiKey(key);

      if (!result.valid) {
        statusEl.innerHTML = '<span class="api-status api-status--error">Ungültiger API-Key</span>';
        showToast('API-Key ist ungültig. Bitte prüfen.', 'error');
        return;
      }

      await setSetting('apiKey', key);

      if (result.reason === 'no_credit') {
        statusEl.innerHTML = `<span class="api-status api-status--warning">Key gültig, aber kein Guthaben. <a href="${BILLING_URL}" target="_blank" rel="noopener">Aufladen</a></span>`;
        showToast('API-Key gespeichert, aber kein Guthaben vorhanden.', 'warning');
      } else if (result.reason === 'rate_limited') {
        statusEl.innerHTML = '<span class="api-status api-status--warning">Key gültig. Rate-Limit aktiv, bitte kurz warten.</span>';
        showToast('API-Key gespeichert.', 'success');
      } else {
        statusEl.innerHTML = '<span class="api-status api-status--ok">Key gültig und einsatzbereit</span>';
        showToast('API-Key gespeichert und geprüft.', 'success');
      }
    } catch (err) {
      statusEl.innerHTML = `<span class="api-status api-status--error">Prüfung fehlgeschlagen: ${escapeAttr(err.message)}</span>`;
      await setSetting('apiKey', key);
      showToast('API-Key gespeichert (Prüfung fehlgeschlagen).', 'warning');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Speichern';
    }
  });

  // Change Password (via server API)
  $('#btnChangePw', container).addEventListener('click', async () => {
    const currentPw = $('#currentPassword', container).value;
    const newPw = $('#newPassword', container).value;
    const confirmPw = $('#confirmPassword', container).value;

    if (!newPw || newPw.length < 4) {
      showToast('Neues Passwort muss mindestens 4 Zeichen haben.', 'warning');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('Neue Passwörter stimmen nicht überein.', 'warning');
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
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

  // Export
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

  // Toast Log
  renderToastLog(container);
  $('#btnClearLog', container).addEventListener('click', () => {
    clearToastLog();
    renderToastLog(container);
    showToast('Log geleert.', 'success');
  });

  // Import
  $('#importFile', container).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('Achtung: Alle bestehenden Daten werden durch das Backup ersetzt. Fortfahren?')) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.recipes || !data.settings) {
        throw new Error('Ungültiges Backup-Format.');
      }
      await importAll(data);
      showToast(`Backup importiert: ${data.recipes.length} Rezepte.`, 'success');
    } catch (err) {
      showToast(`Import-Fehler: ${err.message}`, 'error');
    }
  });
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
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
