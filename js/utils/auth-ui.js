import { getSetting, setSetting } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { $, showToast } from './helpers.js';
import { isAuthenticated, setAuthenticated } from './auth.js';

export async function ensureAuthenticated(container, onSuccess) {
  const passwordHash = await getSetting('passwordHash');

  if (!passwordHash) {
    renderSetPassword(container, onSuccess);
    return;
  }

  if (!isAuthenticated()) {
    renderLogin(container, passwordHash, onSuccess);
    return;
  }

  onSuccess();
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
    await setSetting('passwordHash', await hashPassword(pw));
    setAuthenticated(true);
    showToast('Master-Passwort gesetzt!', 'success');
    onSuccess();
  };

  $('#btnSetPw', container).addEventListener('click', doSet);
  $('#confirmPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSet();
  });
}

function renderLogin(container, passwordHash, onSuccess) {
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
    if (await verifyPassword(pw, passwordHash)) {
      setAuthenticated(true);
      showToast('Entsperrt.', 'success');
      onSuccess();
    } else {
      showToast('Falsches Passwort.', 'error');
    }
  };

  $('#btnLogin', container).addEventListener('click', doLogin);
  $('#loginPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}
