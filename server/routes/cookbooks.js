const { Router } = require('express');
const {
  getAllCookbooks, getCookbook, addCookbook, updateCookbook, deleteCookbook,
  getCookbookRecipes, getRecipeCookbooks, getAllRecipeCookbooks, setRecipeCookbooks, assignRecipesToCookbook,
} = require('../db');

const router = Router();

// GET /api/cookbooks
router.get('/', (req, res) => {
  res.json(getAllCookbooks());
});

// GET /api/cookbooks/memberships – all recipeId/cookbookId pairs (must be before /:id)
router.get('/memberships', (req, res) => {
  res.json(getAllRecipeCookbooks());
});

// GET /api/cookbooks/recipe/:recipeId – must be before /:id
router.get('/recipe/:recipeId', (req, res) => {
  const recipeId = parseInt(req.params.recipeId, 10);
  res.json(getRecipeCookbooks(recipeId));
});

// PUT /api/cookbooks/recipe/:recipeId – must be before /:id
router.put('/recipe/:recipeId', (req, res) => {
  const recipeId = parseInt(req.params.recipeId, 10);
  const { cookbookIds } = req.body;
  if (!Array.isArray(cookbookIds)) return res.status(400).json({ error: 'cookbookIds muss ein Array sein' });
  setRecipeCookbooks(recipeId, cookbookIds);
  res.json({ success: true });
});

// GET /api/cookbooks/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cb = getCookbook(id);
  if (!cb) return res.status(404).json({ error: 'Kochbuch nicht gefunden' });
  res.json(cb);
});

// GET /api/cookbooks/:id/recipes
router.get('/:id/recipes', (req, res) => {
  const id = parseInt(req.params.id, 10);
  res.json(getCookbookRecipes(id));
});

// POST /api/cookbooks
router.post('/', (req, res) => {
  const { name, description, coverTitle, coverSubtitle } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = addCookbook({ name, description, coverTitle, coverSubtitle });
  res.status(201).json({ id: Number(id) });
});

// PUT /api/cookbooks/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cb = getCookbook(id);
  if (!cb) return res.status(404).json({ error: 'Kochbuch nicht gefunden' });
  updateCookbook({ ...req.body, id });
  res.json({ success: true });
});

// DELETE /api/cookbooks/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    deleteCookbook(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/cookbooks/:id/assign  – bulk assign recipes
router.post('/:id/assign', (req, res) => {
  const cookbookId = parseInt(req.params.id, 10);
  const { recipeIds } = req.body;
  if (!Array.isArray(recipeIds)) return res.status(400).json({ error: 'recipeIds muss ein Array sein' });
  assignRecipesToCookbook(recipeIds, cookbookId);
  res.json({ success: true });
});

module.exports = router;
