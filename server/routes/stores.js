const express = require('express');
const router = express.Router();
const { getAllStores, addStore, deleteStore, getProductTags, setProductTag, deleteProductTag } = require('../db');

// GET /api/stores
router.get('/', (req, res) => {
  try {
    res.json(getAllStores());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stores
router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    const id = addStore(name, color, req.user.userId);
    res.json({ id, name: name.trim(), color: color || '#6b7280' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Supermarkt existiert bereits' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stores/:id  (must be before /product-tags/:name to avoid conflict)
router.delete('/:id(\\d+)', (req, res) => {
  try {
    deleteStore(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stores/product-tags
router.get('/product-tags', (req, res) => {
  try {
    res.json(getProductTags());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/stores/product-tags
router.put('/product-tags', (req, res) => {
  const { productName, storeId } = req.body;
  if (!productName) return res.status(400).json({ error: 'productName erforderlich' });
  if (!storeId) return res.status(400).json({ error: 'storeId erforderlich' });
  try {
    setProductTag(productName, parseInt(storeId, 10), req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stores/product-tags/:name
router.delete('/product-tags/:name', (req, res) => {
  try {
    deleteProductTag(decodeURIComponent(req.params.name));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
