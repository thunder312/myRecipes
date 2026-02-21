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
  const recipe = req.body;
  if (!recipe.title) {
    return res.status(400).json({ error: 'Titel fehlt' });
  }
  const id = addRecipe(recipe);
  res.status(201).json({ id: Number(id) });
});

// PUT /api/recipes/:id - update recipe
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipe(id);
  if (!existing) {
    return res.status(404).json({ error: 'Rezept nicht gefunden' });
  }
  updateRecipe({ ...req.body, id });
  res.json({ success: true });
});

// DELETE /api/recipes/:id - delete recipe
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteRecipe(id);
  res.json({ success: true });
});

module.exports = router;
