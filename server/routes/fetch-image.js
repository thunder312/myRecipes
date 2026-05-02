const { Router } = require('express');

const router = Router();
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// GET /api/fetch-image?url=<encoded-url>
// Fetches an image from the given URL server-side and returns it as base64 JSON.
// This avoids browser CORS restrictions when loading images from external sites.
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
        'Accept': 'image/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Bild-Server antwortete mit HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    const mimeType = contentType.split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL enthält kein Bild (falscher Content-Type)' });
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_SIZE) {
      return res.status(400).json({ error: 'Bild zu groß (max. 10 MB)' });
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIZE) {
      return res.status(400).json({ error: 'Bild zu groß (max. 10 MB)' });
    }

    res.json({
      imageBlob: Buffer.from(arrayBuffer).toString('base64'),
      imageMimeType: mimeType,
    });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Timeout beim Laden des Bildes' : err.message;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
