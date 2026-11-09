// Hell/Dunkel-Design (Eulenwerk). Standard ist dunkel.
// Setzt data-theme (App-eigene Regeln in style.css) und data-ew-theme (Eulenwerk-Tokens in eulenwerk.css).
// Der Wert wird lokal in localStorage['ew-theme'] (nicht mehr 'theme': dort steht bei vielen
// noch das alte, nie bewusst gewählte 'light' aus der Zeit vor Eulenwerk) und – wenn angemeldet – serverseitig pro Benutzer gespeichert.

export function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

export function getTheme() {
  try { return normalizeTheme(localStorage.getItem('ew-theme')); } catch { return 'dark'; }
}

export function applyTheme(theme, { save = true } = {}) {
  const t = normalizeTheme(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', t);
  root.setAttribute('data-ew-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--ew-bg').trim() || (t === 'light' ? '#f5f6f8' : '#121417'));
  if (save) { try { localStorage.setItem('ew-theme', t); } catch { /* egal */ } }
  return t;
}
