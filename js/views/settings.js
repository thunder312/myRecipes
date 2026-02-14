import { getSetting, setSetting, exportAll, importAll } from '../db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { $, showToast } from '../utils/helpers.js';
import { isAuthenticated, setAuthenticated } from '../utils/auth.js';

export async function render(container) {
  const passwordHash = await getSetting('passwordHash');

  if (!passwordHash) {
    renderSetPassword(container);
    return;
  }

  if (!isAuthenticated()) {
    renderLogin(container, passwordHash);
    return;
  }

  renderSettings(container);
}

function renderSetPassword(container) {
  container.innerHTML = `
    <div class="settings">
      <h1>Master-Passwort festlegen</h1>
      <section class="settings__section">
        <p class="settings__hint">Lege ein Master-Passwort fest, das die Einstellungen und den Import schützt.</p>
        <div class="form-group">
          <label for="newPw">Neues Passwort</label>
          <input type="password" id="newPw" class="input" placeholder="Passwort" />
        </div>
        <div class="form-group">
          <label for="confirmPw">Passwort bestätigen</label>
          <input type="password" id="confirmPw" class="input" placeholder="Passwort bestätigen" />
        </div>
        <button class="btn btn--primary" id="btnSetPw">Passwort setzen</button>
      </section>
    </div>
  `;

  $('#btnSetPw', container).addEventListener('click', async () => {
    const pw = $('#newPw', container).value;
    const conf = $('#confirmPw', container).value;
    if (!pw || pw.length < 4) {
      showToast('Passwort muss mindestens 4 Zeichen haben.', 'warning');
      return;
    }
    if (pw !== conf) {
      showToast('Passwörter stimmen nicht überein.', 'warning');
      return;
    }
    await setSetting('passwordHash', await hashPassword(pw));
    setAuthenticated(true);
    showToast('Master-Passwort gesetzt!', 'success');
    render(container);
  });
}

function renderLogin(container, passwordHash) {
  container.innerHTML = `
    <div class="settings">
      <h1>Einstellungen</h1>
      <section class="settings__section">
        <h2>Geschützter Bereich</h2>
        <p class="settings__hint">Bitte Master-Passwort eingeben, um die Einstellungen zu öffnen.</p>
        <div class="form-group">
          <input type="password" id="loginPw" class="input" placeholder="Master-Passwort" />
          <button class="btn btn--primary" id="btnLogin">Entsperren</button>
        </div>
      </section>
    </div>
  `;

  const doLogin = async () => {
    const pw = $('#loginPw', container).value;
    if (await verifyPassword(pw, passwordHash)) {
      setAuthenticated(true);
      showToast('Einstellungen entsperrt.', 'success');
      render(container);
    } else {
      showToast('Falsches Passwort.', 'error');
    }
  };

  $('#btnLogin', container).addEventListener('click', doLogin);
  $('#loginPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

async function renderSettings(container) {
  const apiKey = await getSetting('apiKey') || '';

  container.innerHTML = `
    <div class="settings">
      <h1>Einstellungen</h1>

      <section class="settings__section">
        <h2>Anthropic API-Key</h2>
        <p class="settings__hint">Der API-Key wird lokal in deinem Browser gespeichert und nur für die Rezept-Analyse verwendet.</p>
        <div class="form-group">
          <label for="apiKeyInput">API-Key</label>
          <input type="password" id="apiKeyInput" class="input" value="${escapeAttr(apiKey)}" placeholder="sk-ant-..." />
          <button class="btn btn--primary" id="btnSaveKey">Speichern</button>
        </div>
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
        <h2>Über myRecipes</h2>
        <p>Persönliche Rezeptsammlung mit KI-gestützter Kategorisierung.</p>
        <p><small>Deine Daten werden ausschließlich lokal in deinem Browser gespeichert (IndexedDB).</small></p>
      </section>
    </div>
  `;

  // Save API Key
  $('#btnSaveKey', container).addEventListener('click', async () => {
    const key = $('#apiKeyInput', container).value.trim();
    if (!key) {
      showToast('Bitte API-Key eingeben.', 'warning');
      return;
    }
    await setSetting('apiKey', key);
    showToast('API-Key gespeichert.', 'success');
  });

  // Change Password
  $('#btnChangePw', container).addEventListener('click', async () => {
    const currentPw = $('#currentPassword', container).value;
    const newPw = $('#newPassword', container).value;
    const confirmPw = $('#confirmPassword', container).value;

    // Verify current password first
    const currentHash = await getSetting('passwordHash');
    if (!(await verifyPassword(currentPw, currentHash))) {
      showToast('Aktuelles Passwort ist falsch.', 'error');
      return;
    }

    if (!newPw || newPw.length < 4) {
      showToast('Neues Passwort muss mindestens 4 Zeichen haben.', 'warning');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('Neue Passwörter stimmen nicht überein.', 'warning');
      return;
    }
    await setSetting('passwordHash', await hashPassword(newPw));
    showToast('Passwort geändert.', 'success');
    $('#currentPassword', container).value = '';
    $('#newPassword', container).value = '';
    $('#confirmPassword', container).value = '';
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

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
