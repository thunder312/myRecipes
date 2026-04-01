const { Router } = require('express');

const router = Router();

// GET /api/fetch-url?url=<encoded-url>
// Fetches the given URL server-side and returns its HTML content.
// This avoids browser CORS restrictions for external recipe sites.
router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url Parameter fehlt' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Ungültige URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Nur http/https URLs erlaubt' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Ziel-Server antwortete mit HTTP ${response.status}` });
    }

    const html = await response.text();
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Timeout beim Abrufen der URL' : err.message;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
