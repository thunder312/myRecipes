import { analyzeRecipeText, analyzeRecipeImages, analyzeRecipeImage, validateRecipeResults } from './api.js';

const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // stay well under API's 5 MB limit
const MAX_PDF_IMAGE_PAGES = 20;

export async function processURL(url, { multiHint = false } = {}) {
  let html;
  try {
    const resp = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    html = await resp.text();
  } catch (err) {
    throw new Error(`URL konnte nicht geladen werden: ${err.message}`);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Try JSON-LD structured data first (schema.org/Recipe – used by most modern recipe sites)
  if (!multiHint) {
    const jsonLdText = extractJsonLdAsText(doc);
    if (jsonLdText) {
      const results = await analyzeRecipeText(jsonLdText, { multiHint: false });
      return applyFilter(tagResults(results, 'url', url));
    }
  }

  // Fallback: plain text from full page
  const text = doc.body.innerText || doc.body.textContent || '';
  if (text.trim().length < 50) {
    throw new Error('Zu wenig Text auf der Seite gefunden. Bitte kopiere den Rezepttext manuell.');
  }

  const results = await analyzeRecipeText(text, { multiHint });
  return applyFilter(tagResults(results, 'url', url));
}

/** Parst eine ISO-8601-Dauer (PT1H30M) und gibt Minuten zurück. */
function parseIsoDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0);
}

/**
 * Sucht in allen JSON-LD-Blöcken nach einem schema.org/Recipe-Objekt und
 * formatiert es als lesbaren Text für die KI-Analyse.
 * Gibt null zurück, wenn kein Rezept gefunden wurde.
 */
function extractJsonLdAsText(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const candidates = item['@graph'] ? [...item['@graph'], item] : [item];
        for (const candidate of candidates) {
          const types = Array.isArray(candidate['@type']) ? candidate['@type'] : [candidate['@type']];
          if (types.includes('Recipe')) {
            let text = formatLdJsonAsText(candidate);
            // Notizen stehen oft nur im HTML (z.B. WPRM-Plugin), nicht im JSON-LD
            const htmlNotes = extractHtmlNotes(doc);
            if (htmlNotes) text += `\n\nNotizen:\n${htmlNotes}`;
            return text;
          }
        }
      }
    } catch { /* ungültiges JSON-LD */ }
  }
  return null;
}

/**
 * Extrahiert Notizen/Tipps aus bekannten Rezept-Plugin-HTML-Strukturen.
 * Unterstützt: WP Recipe Maker (wprm), Tasty Recipes, Mediavine.
 */
function extractHtmlNotes(doc) {
  const selectors = [
    '.wprm-recipe-notes',
    '.tasty-recipes-notes',
    '.mv-recipe-notes',
    '.recipe-card-notes',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const text = el.innerText || el.textContent || '';
      const cleaned = text.trim().replace(/\s{3,}/g, '\n').trim();
      if (cleaned.length > 5) return cleaned;
    }
  }
  return null;
}

/** Wandelt ein schema.org/Recipe-Objekt in strukturierten Text um. */
function formatLdJsonAsText(ld) {
  const lines = [];

  if (ld.name) lines.push(`Titel: ${ld.name}`);
  if (ld.description) lines.push(`Beschreibung: ${ld.description}`);

  // Zeiten einzeln ausgeben – die KI summiert sie laut Prompt
  const prep = parseIsoDuration(ld.prepTime);
  const cook = parseIsoDuration(ld.cookTime);
  const total = parseIsoDuration(ld.totalTime);
  if (prep)  lines.push(`Vorbereitungszeit: ${prep} Minuten`);
  if (cook)  lines.push(`Zubereitungszeit: ${cook} Minuten`);
  if (total) lines.push(`Gesamtzeit: ${total} Minuten`);

  const yield_ = ld.recipeYield;
  if (yield_) lines.push(`Portionen: ${Array.isArray(yield_) ? yield_[0] : yield_}`);
  if (ld.recipeCuisine) lines.push(`Küche: ${Array.isArray(ld.recipeCuisine) ? ld.recipeCuisine[0] : ld.recipeCuisine}`);
  if (ld.recipeCategory) lines.push(`Kategorie: ${Array.isArray(ld.recipeCategory) ? ld.recipeCategory[0] : ld.recipeCategory}`);

  if (ld.recipeIngredient?.length > 0) {
    lines.push('');
    lines.push('Zutaten:');
    ld.recipeIngredient.forEach(ing => lines.push(`- ${ing}`));
  }

  const instructions = ld.recipeInstructions;
  if (instructions) {
    lines.push('');
    lines.push('Anleitung:');
    const steps = Array.isArray(instructions) ? instructions : [instructions];
    let stepIndex = 1;
    for (const step of steps) {
      if (typeof step === 'string') {
        lines.push(`${stepIndex++}. ${step}`);
      } else if (step['@type'] === 'HowToSection') {
        if (step.name) lines.push(`\n${step.name}:`);
        const sectionSteps = Array.isArray(step.itemListElement) ? step.itemListElement : [];
        sectionSteps.forEach(s => {
          const t = typeof s === 'string' ? s : (s.text || '');
          lines.push(`${stepIndex++}. ${t}`);
        });
      } else {
        lines.push(`${stepIndex++}. ${step.text || ''}`);
      }
    }
  }

  // Notizen – verschiedene Plugin-Felder prüfen (WPRM, Tasty, etc.)
  const noteValue = ld.notes || ld.note || ld['wprm:notes'];
  if (noteValue) {
    lines.push('');
    lines.push('Notizen:');
    const noteText = Array.isArray(noteValue)
      ? noteValue.map(n => typeof n === 'string' ? n : (n.text || '')).join('\n')
      : String(noteValue);
    lines.push(noteText);
  }

  return lines.join('\n');
}

export async function processPDF(file, { multiHint = false } = {}) {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfjsVersion = pdfjsLib.version;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += extractTextWithLineBreaks(content.items) + '\n';
  }

  if (fullText.trim().length < 20) {
    // Image-based PDF: render all pages as images
    const pageCount = Math.min(pdf.numPages, MAX_PDF_IMAGE_PAGES);
    const images = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const raw = await renderPageToBase64(page);
      const base64 = await enhanceForHandwriting(raw, 'image/jpeg');
      images.push({ base64, mediaType: 'image/jpeg' });
    }

    const results = await analyzeRecipeImages(images, { multiHint: multiHint || pageCount > 1 });
    return applyFilter(tagResults(results, 'pdf', file.name));
  }

  const results = await analyzeRecipeText(fullText, { multiHint });
  return applyFilter(tagResults(results, 'pdf', file.name));
}

export async function processImage(file, { multiHint = false } = {}) {
  let base64 = await fileToBase64(file);
  let mediaType = detectMediaType(base64) || file.type || 'image/jpeg';
  const byteSize = Math.ceil(base64.length * 3 / 4);

  if (byteSize > MAX_IMAGE_BYTES) {
    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);

    let quality = 0.85;
    while (quality >= 0.4) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      base64 = dataUrl.split(',')[1];
      if (Math.ceil(base64.length * 3 / 4) <= MAX_IMAGE_BYTES) break;
      quality -= 0.15;
    }
    mediaType = 'image/jpeg';
  }

  base64 = await enhanceForHandwriting(base64, mediaType);
  mediaType = 'image/jpeg';

  const results = await analyzeRecipeImage(base64, mediaType, { multiHint });
  return applyFilter(tagResults(results, 'image', file.name));
}

export async function processImages(files, { multiHint = false } = {}) {
  const images = [];
  for (const file of files) {
    let base64 = await fileToBase64(file);
    let mediaType = detectMediaType(base64) || file.type || 'image/jpeg';
    const byteSize = Math.ceil(base64.length * 3 / 4);

    if (byteSize > MAX_IMAGE_BYTES) {
      const img = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);

      let quality = 0.85;
      while (quality >= 0.4) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        base64 = dataUrl.split(',')[1];
        if (Math.ceil(base64.length * 3 / 4) <= MAX_IMAGE_BYTES) break;
        quality -= 0.15;
      }
      mediaType = 'image/jpeg';
    }

    base64 = await enhanceForHandwriting(base64, mediaType);
    images.push({ base64, mediaType: 'image/jpeg' });
  }

  const results = await analyzeRecipeImages(images, { multiHint: multiHint || files.length > 1 });
  return applyFilter(tagResults(results, 'image', files.map(f => f.name).join(', ')));
}

export async function processText(text, { multiHint = false } = {}) {
  const results = await analyzeRecipeText(text, { multiHint });
  return applyFilter(tagResults(results, 'text', 'Manueller Text'));
}

/**
 * Setzt sourceType und sourceRef auf jedes Ergebnis im Array.
 */
function tagResults(results, sourceType, sourceRef) {
  for (const r of results) {
    r.sourceType = sourceType;
    r.sourceRef = sourceRef;
  }
  return results;
}

/**
 * Wendet den Qualitätsfilter an und hängt die Anzahl gefilterter Rezepte an.
 * Gibt das Array zurück mit ._filtered Property.
 */
function applyFilter(results) {
  const { valid, filtered } = validateRecipeResults(results);
  valid._filtered = filtered;
  return valid;
}

/**
 * Erkennt den tatsächlichen Bildtyp anhand der Magic Bytes im Base64-String.
 */
function detectMediaType(base64) {
  const prefix = base64.slice(0, 16);
  if (prefix.startsWith('/9j/'))           return 'image/jpeg';
  if (prefix.startsWith('iVBORw'))         return 'image/png';
  if (prefix.startsWith('R0lGOD'))         return 'image/gif';
  if (prefix.startsWith('UklGR'))          return 'image/webp';
  if (prefix.startsWith('Qk'))             return 'image/bmp';
  return null;
}

async function renderPageToBase64(page) {
  let scale = 2;
  let quality = 0.85;

  while (scale >= 1) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    const byteSize = Math.ceil(base64.length * 3 / 4);

    if (byteSize <= MAX_IMAGE_BYTES) return base64;

    if (quality > 0.5) {
      quality -= 0.15;
    } else {
      scale -= 0.5;
      quality = 0.85;
    }
  }

  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
}

/**
 * Verbessert die Lesbarkeit von handgeschriebenem Text durch Kontrast- und
 * Helligkeitsanpassung. Gibt base64-JPEG zurück.
 */
async function enhanceForHandwriting(base64, mediaType) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(200%) brightness(115%) saturate(0%)';
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.src = `data:${mediaType};base64,${base64}`;
  });
}

/**
 * Rekonstruiert Zeilenumbrüche aus pdfjs-Textelementen anhand der Y-Position.
 * Elemente mit deutlich veränderter Y-Koordinate bekommen einen Zeilenumbruch vorangestellt.
 */
function extractTextWithLineBreaks(items) {
  if (!items || items.length === 0) return '';
  const LINE_THRESHOLD = 2; // mm – Y-Abstand gilt als neue Zeile
  let result = '';
  let lastY = null;
  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > LINE_THRESHOLD) {
      result += '\n';
    } else if (result && !result.endsWith('\n') && !result.endsWith(' ')) {
      result += ' ';
    }
    result += item.str;
    if (y !== null) lastY = y;
  }
  return result;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
