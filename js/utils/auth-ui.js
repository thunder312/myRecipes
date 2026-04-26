import { $, showToast } from './helpers.js';
import { isAuthenticated, setAuthenticated, getAuthToken } from './auth.js';
import { t, setLanguage, getLanguage } from '../i18n.js';

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
    showToast(t('auth.serverUnreachable'), 'error');
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
  let langChangedByUser = false;

  const render = () => {
    const lang = getLanguage();
    container.innerHTML = `
      <div class="auth">
        <div class="auth__logo">
          <img src="icon.png" width="64" alt="myRecipes" />
        </div>
        <div class="auth__lang-toggle">
          <div class="lang-segment">
            <button class="lang-segment__btn${lang === 'de' ? ' lang-segment__btn--active' : ''}" data-lang="de">DE</button>
            <button class="lang-segment__btn${lang === 'en' ? ' lang-segment__btn--active' : ''}" data-lang="en">EN</button>
          </div>
        </div>
        <h1>${t('auth.title')}</h1>
        <section class="auth__section">
          <div class="form-group">
            <label for="loginUser">${t('auth.username')}</label>
            <input type="text" id="loginUser" class="input" placeholder="${t('auth.username')}" autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="loginPw">${t('auth.password')}</label>
            <input type="password" id="loginPw" class="input" placeholder="${t('auth.password')}" autocomplete="current-password" />
          </div>
          <button class="btn btn--primary btn--full" id="btnLogin">${t('auth.loginBtn')}</button>
          <div class="auth__error hidden" id="loginError"></div>
        </section>
      </div>
    `;

    container.querySelector('.lang-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lang]');
      if (!btn || btn.dataset.lang === getLanguage()) return;
      langChangedByUser = true;
      setLanguage(btn.dataset.lang, { save: true, notify: false });
      render();
    });

    const doLogin = async () => {
      const username = $('#loginUser', container).value.trim();
      const pw = $('#loginPw', container).value;
      const errEl = $('#loginError', container);
      errEl.classList.add('hidden');

      if (!username || !pw) {
        errEl.textContent = t('auth.required');
        errEl.classList.remove('hidden');
        return;
      }

      const btn = $('#btnLogin', container);
      btn.disabled = true;
      btn.textContent = t('auth.loggingIn');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password: pw }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          errEl.textContent = err.error || t('auth.failed');
          errEl.classList.remove('hidden');
          return;
        }

        const data = await res.json();

        if (langChangedByUser) {
          // User explicitly selected a language on login screen → save to server
          fetch('/api/auth/language', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` },
            body: JSON.stringify({ language: getLanguage() }),
          }).catch(() => {});
        } else if (data.language && data.language !== getLanguage()) {
          // No explicit selection → apply the user's saved server preference
          setLanguage(data.language, { save: true, notify: false });
        }

        // Apply saved theme from server
        if (data.theme) {
          document.documentElement.setAttribute('data-theme', data.theme);
          localStorage.setItem('theme', data.theme);
        }

        setAuthenticated(data.token, data.username, data.role);
        onSuccess();
      } catch (err) {
        errEl.textContent = `${err.message}`;
        errEl.classList.remove('hidden');
      } finally {
        const btn2 = $('#btnLogin', container);
        if (btn2) {
          btn2.disabled = false;
          btn2.textContent = t('auth.loginBtn');
        }
      }
    };

    $('#btnLogin', container).addEventListener('click', doLogin);
    $('#loginPw', container).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    $('#loginUser', container).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#loginPw', container).focus();
    });

    setTimeout(() => $('#loginUser', container)?.focus(), 50);
  };

  render();
}
