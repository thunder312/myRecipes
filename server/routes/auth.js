const { Router } = require('express');
const { getSetting, setSetting, hashPassword, verifyPassword } = require('../db');

const router = Router();

// Check if authenticated
router.get('/check', (req, res) => {
  const hasPassword = !!getSetting('passwordHash');
  const { validateToken } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  res.json({
    authenticated: validateToken(token),
    hasPassword,
  });
});

// Login with password
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Passwort fehlt' });
  }

  const storedHash = getSetting('passwordHash');
  if (!storedHash) {
    return res.status(400).json({ error: 'Kein Passwort gesetzt' });
  }

  const valid = verifyPassword(password, storedHash);
  if (!valid) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }

  const { createToken } = req.app.get('auth');
  const token = createToken();
  res.json({ success: true, token });
});

// Set initial password (only when no password exists)
router.post('/setup', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
  }

  const existingHash = getSetting('passwordHash');
  if (existingHash) {
    return res.status(400).json({ error: 'Passwort ist bereits gesetzt' });
  }

  const hash = hashPassword(password);
  setSetting('passwordHash', hash);

  const { createToken } = req.app.get('auth');
  const token = createToken();
  res.json({ success: true, token });
});

// Change password (requires auth via token)
router.post('/change-password', (req, res) => {
  const { validateToken } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!validateToken(token)) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 4 Zeichen haben' });
  }

  const storedHash = getSetting('passwordHash');
  if (!verifyPassword(currentPassword, storedHash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }

  setSetting('passwordHash', hashPassword(newPassword));
  res.json({ success: true });
});

// Logout
router.post('/logout', (req, res) => {
  const { invalidateToken } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) invalidateToken(token);
  res.json({ success: true });
});

module.exports = router;
