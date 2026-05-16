const { Router } = require('express');
const { getUserByUsername, updateUserPassword, updateUsername, getUser, verifyPassword, getUserLanguage, setUserLanguage, getUserTheme, setUserTheme, getUserLastLogin, updateUserLastLogin, setUserShowNewsPopup, getNewRecipesSince } = require('../db');

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
  const language = getUserLanguage(user.id);
  const theme = getUserTheme(user.id);
  const loginMeta = getUserLastLogin(user.id);
  const previousLoginAt = loginMeta ? loginMeta.lastLoginAt : null;
  const showNewsPopup = loginMeta ? loginMeta.showNewsPopup : true;
  updateUserLastLogin(user.id, new Date().toISOString());
  res.json({ success: true, token, username: user.username, role: user.role, language, theme, lastLoginAt: previousLoginAt, showNewsPopup });
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

// PATCH /api/auth/language – save preferred language for authenticated user
router.patch('/language', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });
  const { language } = req.body;
  if (!['de', 'en'].includes(language)) return res.status(400).json({ error: 'Invalid language' });
  setUserLanguage(tokenData.userId, language);
  res.json({ success: true });
});

// PATCH /api/auth/news-popup – toggle news popup setting for authenticated user
router.patch('/news-popup', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });
  const { showNewsPopup } = req.body;
  if (typeof showNewsPopup !== 'boolean') return res.status(400).json({ error: 'Invalid value' });
  setUserShowNewsPopup(tokenData.userId, showNewsPopup);
  res.json({ success: true });
});

// GET /api/auth/news?since=<ISO> – fetch new recipes since given timestamp
router.get('/news', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });
  const { since } = req.query;
  if (!since) return res.status(400).json({ error: 'since parameter required' });
  const recipes = getNewRecipesSince(since);
  res.json({ recipes });
});

// PATCH /api/auth/theme – save preferred theme for authenticated user
router.patch('/theme', (req, res) => {
  const { validateTokenWithData } = req.app.get('auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenData = validateTokenWithData(token);
  if (!tokenData) return res.status(401).json({ error: 'Nicht authentifiziert' });
  const { theme } = req.body;
  if (!['light', 'dark'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
  setUserTheme(tokenData.userId, theme);
  res.json({ success: true });
});

module.exports = router;
