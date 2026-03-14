// Session management with sessionStorage persistence and timeout.
// The server token is stored in sessionStorage and sent as Authorization header.

const TOKEN_KEY = 'myRecipes_token';
const ACTIVITY_KEY = 'myRecipes_lastActivity';
const USER_KEY = 'myRecipes_user'; // JSON: { username, role }
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let importRunning = false;

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const lastActivity = parseInt(sessionStorage.getItem(ACTIVITY_KEY) || '0', 10);
  if (Date.now() - lastActivity > TIMEOUT_MS) {
    logout();
    return false;
  }

  // Update activity timestamp
  sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  return true;
}

export function setAuthenticated(token, username, role) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    sessionStorage.setItem(USER_KEY, JSON.stringify({ username: username || '', role: role || 'user' }));
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACTIVITY_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
}

export function getAuthUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');
  } catch { return {}; }
}

export function isAdmin() {
  return getAuthUser().role === 'admin';
}

export function logout() {
  const token = getAuthToken();
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ACTIVITY_KEY);
  sessionStorage.removeItem(USER_KEY);
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }
}

export function isImportRunning() {
  return importRunning;
}

export function setImportRunning(value) {
  importRunning = value;
}

export function touchActivity() {
  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  }
}
