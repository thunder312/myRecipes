const { Router } = require('express');
const { getUserByUsername, updateUserPassword, updateUsername, getUser, verifyPassword } = require('../db');

const router = Router();

// GET /api/auth/check
router.get('/check', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const data = validateTokenWithData(token);
  res.json({
    authenticated: !!data,
    username: data ? data.username : null,
    role: data ? data.role : null,
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  const user = getUserByUsername(username.trim());
  if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  const { createToken } = req.app.get('auth');
  const token = createToken(user.id, user.username, user.role);
  res.json({ success: true, token, username: user.username, role: user.role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { invalidateToken } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) invalidateToken(token);
  res.json({ success: true });
});

// POST /api/auth/change-password  (own password, any authenticated user)
router.post('/change-password', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Neues Passwort muss mindestens 4 Zeichen haben' });

  const user = getUser(tokenData.userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }

  updateUserPassword(tokenData.userId, newPassword);
  res.json({ success: true });
});

// POST /api/auth/change-username  (own username, any authenticated user)
router.post('/change-username', (req, res) => {
  const { validateTokenWithData, createToken, invalidateToken } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });

  const { newUsername, currentPassword } = req.body;
  if (!newUsername || !newUsername.trim()) return res.status(400).json({ error: 'Neuer Benutzername erforderlich' });
  if (!currentPassword) return res.status(400).json({ error: 'Aktuelles Passwort erforderlich' });

  const user = getUser(tokenData.userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }

  try {
    updateUsername(tokenData.userId, newUsername.trim());
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }

  // Invalidate old token and issue new one with updated username
  invalidateToken(token);
  const newToken = createToken(tokenData.userId, newUsername.trim(), tokenData.role);
  res.json({ success: true, token: newToken, username: newUsername.trim() });
});

module.exports = router;
