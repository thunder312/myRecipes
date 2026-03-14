const { Router } = require('express');
const { getAllUsers, getUser, addUser, updateUserPassword, updateUserRole, deleteUser } = require('../db');

const router = Router();

// GET /api/users – list all users (admin only)
router.get('/', (req, res) => {
  res.json(getAllUsers());
});

// POST /api/users – create user (admin only)
router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  if (password.length < 4) return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
  try {
    const id = addUser(username.trim(), password, role === 'admin' ? 'admin' : 'user');
    res.status(201).json({ id: Number(id) });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Benutzername bereits vergeben' : err.message });
  }
});

// PUT /api/users/:id/password – reset password (admin only)
router.put('/:id/password', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
  if (!getUser(id)) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  updateUserPassword(id, newPassword);
  res.json({ success: true });
});

// PUT /api/users/:id/role – change role (admin only)
router.put('/:id/role', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
  if (!getUser(id)) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  updateUserRole(id, role);
  res.json({ success: true });
});

// DELETE /api/users/:id (admin only)
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    deleteUser(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
