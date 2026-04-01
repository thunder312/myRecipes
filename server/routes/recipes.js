const { Router } = require('express');
const { getAllRecipes, getRecipe, addRecipe, updateRecipe, deleteRecipe } = require('../db');

const router = Router();

// GET /api/recipes - all recipes
router.get('/', (req, res) => {
  const recipes = getAllRecipes();
  res.json(recipes);
});

// GET /api/recipes/:id - single recipe
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const recipe = getRecipe(id);
  if (!recipe) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  res.json(recipe);
});

// POST /api/recipes - create recipe
router.post('/', (req, res) => {
  const recipe = { ...req.body };
  if (!recipe.title) {
    return res.status(400).json({ error: 'Titel fehlt' });
  }
  const extraCookbookIds = Array.isArray(recipe._cookbookIds) ? recipe._cookbookIds : [];
  delete recipe._cookbookIds;
  const userId = req.user ? req.user.userId : null;
  const id = addRecipe(recipe, extraCookbookIds, userId);
  res.status(201).json({ id: Number(id) });
});

// PUT /api/recipes/:id - full update (requires ownership)
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipe(id);
  if (!existing) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  // Ownership check: only the creator or an admin may fully edit
  if (req.user.role !== 'admin' && existing.createdBy && existing.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Keine Berechtigung – du kannst nur deine eigenen Rezepte bearbeiten.' });
  }
  updateRecipe({ ...req.body, id });
  res.json({ success: true });
});

// PATCH /api/recipes/:id - partial update for notes and cooked tracking (any authenticated user)
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipe(id);
  if (!existing) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  const { notes, cookedDates, cookedCount } = req.body;
  const update = { ...existing };
  if (notes !== undefined) update.notes = notes;
  if (cookedDates !== undefined) update.cookedDates = cookedDates;
  if (cookedCount !== undefined) update.cookedCount = cookedCount;
  updateRecipe(update);
  res.json({ success: true });
});

// DELETE /api/recipes/:id - delete recipe (requires ownership)
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipe(id);
  if (!existing) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  // Ownership check
  if (req.user.role !== 'admin' && existing.createdBy && existing.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Keine Berechtigung – du kannst nur deine eigenen Rezepte löschen.' });
  }
  deleteRecipe(id);
  res.json({ success: true });
});

module.exports = router;
