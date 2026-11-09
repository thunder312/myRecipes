import { $, showToast } from './helpers.js';
import { isAuthenticated, setAuthenticated, getAuthToken, setShowNewsPopup } from './auth.js';
import { t, setLanguage, getLanguage } from '../i18n.js';
import { applyTheme } from './theme.js';

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
    // Eulenwerk-Standard-Login (.ew-login aus css/eulenwerk.css): in allen Apps gleich, nur die Akzentfarbe unterscheidet sich
    container.innerHTML = `
      <div class="ew-login">
        <form class="ew-login__card" id="loginForm" novalidate>
          <div class="ew-login__brand">
            <img src="icon.svg" alt="" class="ew-login__logo" />
            <h1>myRecipes</h1>
            <p>${t('auth.title')}</p>
          </div>
          <div class="auth__lang-toggle">
            <div class="lang-segment">
              <button type="button" class="lang-segment__btn${lang === 'de' ? ' lang-segment__btn--active' : ''}" data-lang="de">DE</button>
              <button type="button" class="lang-segment__btn${lang === 'en' ? ' lang-segment__btn--active' : ''}" data-lang="en">EN</button>
            </div>
          </div>
          <div class="ew-field">
            <label class="ew-label" for="loginUser">${t('auth.username')}</label>
            <input type="text" id="loginUser" class="ew-input" placeholder="${t('auth.username')}" autocomplete="username" />
          </div>
          <div class="ew-field">
            <label class="ew-label" for="loginPw">${t('auth.password')}</label>
            <input type="password" id="loginPw" class="ew-input" placeholder="${t('auth.password')}" autocomplete="current-password" />
          </div>
          <div class="ew-login__error hidden" id="loginError"></div>
          <button type="submit" class="ew-btn ew-btn--primary ew-btn--block" id="btnLogin">${t('auth.loginBtn')}</button>
        </form>
        <div class="ew-login__foot">
          <a class="ew-brand" href="https://daniel-ertl.de" target="_blank" rel="noopener"><svg class="ew-logo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5 C11 12 16 13 24 13 C28 13 30 15 32 16 C34 15 36 13 40 13 C48 13 53 12 56 5"/><circle cx="22" cy="28" r="9"/><circle cx="42" cy="28" r="9"/><circle fill="currentColor" stroke="none" cx="22" cy="28" r="3.2"/><circle fill="currentColor" stroke="none" cx="42" cy="28" r="3.2"/><path d="M29.5 39 L32 42.5 L34.5 39"/><path d="M13 28 V48 C13 54 18 59 24 59 H40 C46 59 51 54 51 48 V28"/><path d="M19 40 C18.5 48 19.5 54 23 59"/><path d="M45 40 C45.5 48 44.5 54 41 59"/></svg>Ein Eulenwerk-Projekt</a>
          <button type="button" class="ew-btn ew-btn--ghost ew-btn--sm" data-ew-about>Über</button>
        </div>
      </div>
    `;
    // Über-Knopf neu binden (Login wird bei Sprachwechsel neu gerendert)
    window.EulenwerkAbout?.init(window.__ewAboutCfg || { app: 'myRecipes' });

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
        if (data.theme) applyTheme(data.theme);

        setAuthenticated(data.token, data.username, data.role);
        setShowNewsPopup(data.showNewsPopup !== false);
        onSuccess();
        if (data.showNewsPopup !== false && data.lastLoginAt) {
          import('../news-popup.js').then(m => m.maybeShowNewsPopup(data.lastLoginAt)).catch(() => {});
        }
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

    $('#loginForm', container).addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
    // Enter im Benutzerfeld springt zum Passwort statt das Formular abzuschicken; Enter im Passwortfeld = Submit
    $('#loginUser', container).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#loginPw', container).focus(); }
    });

    setTimeout(() => $('#loginUser', container)?.focus(), 50);
  };

  render();
}
