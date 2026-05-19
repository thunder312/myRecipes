const { Router } = require('express');
const { getDB } = require('../db');

const router = Router();

// GET /api/ai/pixabay?q=<query>&lang=de
router.get('/pixabay', async (req, res) => {
  const { q, lang = 'en' } = req.query;
  if (!q) return res.status(400).json({ error: 'q Parameter fehlt' });

  const db = getDB();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('pixabayKey');
  const apiKey = row?.value?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return res.status(503).json({ error: 'Pixabay API-Key nicht konfiguriert. Bitte in den Einstellungen eintragen.' });
  }

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', q);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('category', 'food');
  url.searchParams.set('per_page', '5');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('lang', lang);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 429) {
      return res.status(429).json({ error: 'Pixabay Rate Limit erreicht. Bitte kurz warten.' });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(502).json({ error: `Pixabay Fehler ${response.status}: ${body.slice(0, 100)}` });
    }

    const data = await response.json();
    const hits = (data.hits || []).map(h => ({
      id: h.id,
      previewURL: h.previewURL,
      webformatURL: h.webformatURL,
      tags: h.tags,
    }));
    res.json({ hits, total: data.totalHits || 0 });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Timeout bei Pixabay-Anfrage' : err.message;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
