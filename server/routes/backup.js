const { Router } = require('express');
const { exportAll, importAll } = require('../db');

const router = Router();

// GET /api/backup/export
router.get('/export', (req, res) => {
  const data = exportAll();
  res.json(data);
});

// POST /api/backup/import
router.post('/import', (req, res) => {
  const data = req.body;
  if (!data.recipes || !data.settings) {
    return res.status(400).json({ error: 'Ungültiges Backup-Format' });
  }
  importAll(data);
  res.json({ success: true, imported: { recipes: data.recipes.length, settings: data.settings.length } });
});

module.exports = router;
