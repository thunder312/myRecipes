const { Router } = require('express');

const router = Router();

const CHEFKOCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// GET /api/ai/chefkoch?q=<query>
router.get('/chefkoch', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q Parameter fehlt' });

  try {
    const query = q.trim().replace(/\s+/g, '+');
    const searchUrl = `https://www.chefkoch.de/rs/s0/${query}/Rezepte.html`;
    const searchHtml = await fetch(searchUrl, {
      headers: { 'User-Agent': CHEFKOCH_UA, 'Accept-Language': 'de-DE,de;q=0.9' },
      signal: AbortSignal.timeout(10000),
    }).then(r => r.text());

    // Recipe ID → title from search result links
    const recipeTitles = {};
    for (const m of searchHtml.matchAll(/\/rezepte\/(\d+)\/([^"'\s]+)\.html/g)) {
      if (!recipeTitles[m[1]]) {
        recipeTitles[m[1]] = m[2].replace(/-/g, ' ');
      }
    }

    const allUrls = searchHtml.match(
      /https:\/\/img\.chefkoch-cdn\.de\/rezepte\/\d+\/bilder\/\d+\/[^"'\s]+\.jpg/g
    ) || [];

    const seen = new Set();
    const hits = [];
    for (const url of allUrls) {
      const m = url.match(/(https:\/\/img\.chefkoch-cdn\.de\/rezepte\/(\d+)\/bilder\/\d+)\/[^/]+\/(.+\.jpg)/);
      if (!m) continue;
      const key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        previewURL: `${key}/crop-240x300/${m[3]}`,
        webformatURL: `${key}/fit-960x720/${m[3]}`,
        chefkochTitle: recipeTitles[m[2]] || '',
      });
      if (hits.length >= 5) break;
    }

    res.json({ hits, total: hits.length });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Timeout bei Chefkoch-Anfrage' : err.message;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
