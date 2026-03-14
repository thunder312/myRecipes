import { $, showToast } from './helpers.js';
import { isAuthenticated, setAuthenticated, getAuthToken } from './auth.js';

export async function ensureAuthenticated(container, onSuccess) {
  if (isAuthenticated()) {
    onSuccess();
    return;
  }

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

  if (authState.authenticated) {
    setAuthenticated(getAuthToken(), authState.username, authState.role);
    onSuccess();
    return;
  }

  renderLogin(container, onSuccess);
}

function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <div class="auth">
      <div class="auth__logo">
        <img src="icon.png" width="64" alt="myRecipes" />
      </div>
      <h1>Anmelden</h1>
      <section class="auth__section">
        <div class="form-group">
          <label for="loginUser">Benutzername</label>
          <input type="text" id="loginUser" class="input" placeholder="Benutzername" autocomplete="username" />
        </div>
        <div class="form-group">
          <label for="loginPw">Passwort</label>
          <input type="password" id="loginPw" class="input" placeholder="Passwort" autocomplete="current-password" />
        </div>
        <button class="btn btn--primary btn--full" id="btnLogin">Anmelden</button>
        <div class="auth__error hidden" id="loginError"></div>
      </section>
    </div>
  `;

  const doLogin = async () => {
    const username = $('#loginUser', container).value.trim();
    const pw = $('#loginPw', container).value;
    const errEl = $('#loginError', container);
    errEl.classList.add('hidden');

    if (!username || !pw) {
      errEl.textContent = 'Bitte Benutzername und Passwort eingeben.';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = $('#btnLogin', container);
    btn.disabled = true;
    btn.textContent = 'Anmelden...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pw }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        errEl.textContent = err.error || 'Anmeldung fehlgeschlagen.';
        errEl.classList.remove('hidden');
        return;
      }

      const data = await res.json();
      setAuthenticated(data.token, data.username, data.role);
      onSuccess();
    } catch (err) {
      errEl.textContent = `Fehler: ${err.message}`;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  };

  $('#btnLogin', container).addEventListener('click', doLogin);
  $('#loginPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
  $('#loginUser', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#loginPw', container).focus();
  });

  // Focus username field
  setTimeout(() => $('#loginUser', container)?.focus(), 50);
}
