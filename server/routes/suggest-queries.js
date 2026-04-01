const express = require('express');
const { getAllSavedQueries, addSavedQuery, deleteSavedQuery } = require('../db');

const router = express.Router();

// GET /api/suggest-queries – public
router.get('/', (req, res) => {
  res.json(getAllSavedQueries());
});

// POST /api/suggest-queries – requires auth (via middleware in index.js)
router.post('/', (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question darf nicht leer sein.' });
  }
  const id = addSavedQuery(question);
  res.status(201).json({ id });
});

// DELETE /api/suggest-queries/:id – requires auth (via middleware in index.js)
router.delete('/:id', (req, res) => {
  deleteSavedQuery(parseInt(req.params.id, 10));
  res.json({ success: true });
});

module.exports = router;
