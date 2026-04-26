const { Router } = require('express');
const { getAllRecipes, getRecipe, addRecipe, updateRecipe, deleteRecipe, upsertUserRecipeStats, setFavorite, getDB } = require('../db');

const router = Router();

// GET /api/recipes - all recipes (cooked stats user-specific if authenticated)
router.get('/', (req, res) => {
  const userId = req.user?.userId || null;
  res.set('Cache-Control', 'no-store');
  res.json(getAllRecipes(userId));
});

// GET /api/recipes/:id - single recipe (cooked stats user-specific if authenticated)
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const userId = req.user?.userId || null;
  const recipe = getRecipe(id, userId);
  if (!recipe) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  res.set('Cache-Control', 'no-store');
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
  const { notes, cookedDates, cookedCount, rating } = req.body;

  // Cooked stats are per-user – stored in user_recipe_stats
  if (cookedDates !== undefined || cookedCount !== undefined) {
    upsertUserRecipeStats(
      req.user.userId,
      id,
      cookedDates !== undefined ? cookedDates : [],
      cookedCount !== undefined ? cookedCount : 0
    );
  }

  // Notes and rating are stored on the recipe itself – use targeted UPDATE to avoid
  // overwriting unrelated fields (e.g. large imageBlob) via the generic updateRecipe path
  if (rating !== undefined) {
    getDB().prepare('UPDATE recipes SET rating = ?, updatedAt = ? WHERE id = ?')
      .run(rating, new Date().toISOString(), id);
  }
  if (notes !== undefined) {
    updateRecipe({ ...existing, notes });
  }

  res.json({ success: true });
});

// PATCH /api/recipes/:id/favorite - toggle favorite for the current user
router.patch('/:id/favorite', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getRecipe(id)) return res.status(404).json({ error: 'Rezept nicht gefunden' });
  const value = req.body.favorite ? 1 : 0;
  setFavorite(req.user.userId, id, value);
  res.json({ success: true });
});

// PATCH /api/recipes/:id/image - add, replace, or delete recipe image (requires ownership)
router.patch('/:id/image', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipe(id);
  if (!existing) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  if (req.user.role !== 'admin' && existing.createdBy && existing.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  const { imageBlob, imageMimeType } = req.body;
  const imgBuffer = (typeof imageBlob === 'string' && imageBlob.length > 0)
    ? Buffer.from(imageBlob, 'base64')
    : null;
  getDB().prepare('UPDATE recipes SET imageBlob = ?, imageMimeType = ?, updatedAt = ? WHERE id = ?')
    .run(imgBuffer, imageMimeType || null, new Date().toISOString(), id);
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
