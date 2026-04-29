const express = require('express');
const router = express.Router();
const {
  getWeekPlan, saveWeekPlan,
  getWeekShoppingList, saveWeekShoppingList, deleteWeekShoppingList,
  getRecipe,
} = require('../db');

// GET /api/weekplan
router.get('/', (req, res) => {
  try {
    res.json(getWeekPlan(req.user.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/weekplan
router.put('/', (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be an array' });
  try {
    saveWeekPlan(req.user.userId, slots);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weekplan/shopping-list
router.get('/shopping-list', (req, res) => {
  try {
    res.json(getWeekShoppingList(req.user.userId) || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/weekplan/shopping-list
router.put('/shopping-list', (req, res) => {
  const { items, extras } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
  try {
    saveWeekShoppingList(req.user.userId, items, extras || []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/weekplan/shopping-list
router.delete('/shopping-list', (req, res) => {
  try {
    deleteWeekShoppingList(req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
