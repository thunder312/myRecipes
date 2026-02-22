// Session management with sessionStorage persistence and timeout.
// The server token is stored in sessionStorage and sent as Authorization header.

const TOKEN_KEY = 'myRecipes_token';
const ACTIVITY_KEY = 'myRecipes_lastActivity';
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

export function setAuthenticated(token) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACTIVITY_KEY);
  }
}

export function logout() {
  const token = getAuthToken();
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ACTIVITY_KEY);
  // Also invalidate server token (fire-and-forget)
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
