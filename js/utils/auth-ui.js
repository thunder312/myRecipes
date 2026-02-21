import { $, showToast } from './helpers.js';
import { isAuthenticated, setAuthenticated, getAuthToken } from './auth.js';

export async function ensureAuthenticated(container, onSuccess) {
  // If local session is valid (within 15-min timeout), trust it and proceed.
  // The server will still validate the token on every API call.
  if (isAuthenticated()) {
    onSuccess();
    return;
  }

  // No local session – check server for password state
  let authState;
  try {
    const headers = {};
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/auth/check', { headers });
    authState = await res.json();
  } catch {
    showToast('Server nicht erreichbar.', 'error');
    return;
  }

  // No password set yet → initial setup
  if (!authState.hasPassword) {
    renderSetPassword(container, onSuccess);
    return;
  }

  // Not authenticated → show login
  renderLogin(container, onSuccess);
}

function renderSetPassword(container, onSuccess) {
  container.innerHTML = `
    <div class="auth">
      <h1>Master-Passwort festlegen</h1>
      <section class="auth__section">
        <p class="auth__hint">Lege ein Master-Passwort fest, das die Einstellungen und den Import schützt.</p>
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

  const doSet = async () => {
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

    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Fehler beim Setzen des Passworts.', 'error');
        return;
      }
      const data = await res.json();
      setAuthenticated(data.token);
      showToast('Master-Passwort gesetzt!', 'success');
      onSuccess();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  };

  $('#btnSetPw', container).addEventListener('click', doSet);
  $('#confirmPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSet();
  });
}

function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <div class="auth">
      <h1>Geschützter Bereich</h1>
      <section class="auth__section">
        <p class="auth__hint">Bitte Master-Passwort eingeben, um fortzufahren.</p>
        <div class="form-group">
          <input type="password" id="loginPw" class="input" placeholder="Master-Passwort" />
          <button class="btn btn--primary" id="btnLogin">Entsperren</button>
        </div>
      </section>
    </div>
  `;

  const doLogin = async () => {
    const pw = $('#loginPw', container).value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Falsches Passwort.', 'error');
        return;
      }

      const data = await res.json();
      setAuthenticated(data.token);
      showToast('Entsperrt.', 'success');
      onSuccess();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  };

  $('#btnLogin', container).addEventListener('click', doLogin);
  $('#loginPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}
