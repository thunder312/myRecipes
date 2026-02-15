// Session management with sessionStorage persistence and timeout

const SESSION_KEY = 'myRecipes_session';
const ACTIVITY_KEY = 'myRecipes_lastActivity';
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let importRunning = false;

function generateToken() {
  const arr = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isAuthenticated() {
  const token = sessionStorage.getItem(SESSION_KEY);
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

export function setAuthenticated(value) {
  if (value) {
    sessionStorage.setItem(SESSION_KEY, generateToken());
    sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } else {
    logout();
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ACTIVITY_KEY);
}

export function isImportRunning() {
  return importRunning;
}

export function setImportRunning(value) {
  importRunning = value;
}
