// Shared authentication state across views
let authenticated = false;
let importRunning = false;

export function isAuthenticated() {
  return authenticated;
}

export function setAuthenticated(value) {
  authenticated = value;
}

export function isImportRunning() {
  return importRunning;
}

export function setImportRunning(value) {
  importRunning = value;
}
