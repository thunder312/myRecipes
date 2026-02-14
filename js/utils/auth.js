// Shared authentication state across views
let authenticated = false;

export function isAuthenticated() {
  return authenticated;
}

export function setAuthenticated(value) {
  authenticated = value;
}
