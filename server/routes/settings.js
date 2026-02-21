const { Router } = require('express');
const { getSetting, setSetting } = require('../db');

const router = Router();

// GET /api/settings/:key
router.get('/:key', (req, res) => {
  const value = getSetting(req.params.key);
  if (value === null) {
    return res.status(404).json({ error: 'Setting nicht gefunden' });
  }
  res.json({ value });
});

// PUT /api/settings/:key
router.put('/:key', (req, res) => {
  const { value } = req.body;
  setSetting(req.params.key, value);
  res.json({ success: true });
});

module.exports = router;
