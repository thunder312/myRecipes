import { getSetting } from './db.js';
import { t, getLanguage } from './i18n.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const BILLING_URL = 'https://console.anthropic.com/settings/billing';
const API_TIMEOUT_MS = 120_000; // 2 Minuten – hängende Requests erkennen

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function getApiKey() {
  const key = await getSetting('apiKey');
  if (!key) throw new Error(t('apiErrors.noKey'));
  return key;
}

function handleApiError(response, errBody) {
  const status = response.status;
  const msg = errBody?.error?.message || response.statusText;
  console.error(`[API] HTTP ${status}:`, msg);

  if (status === 401) {
    throw new ApiError(t('apiErrors.invalidKey'), status, false);
  }
  if (status === 429) {
    if (errBody?.error?.type === 'rate_limit_error') {
      throw new ApiError(t('apiErrors.rateLimit'), status, true);
    }
    throw new ApiError(
      `${t('apiErrors.noCredit')} (HTTP ${status}). <a href="${BILLING_URL}" target="_blank" rel="noopener">${t('apiErrors.topUp')}</a>`,
      status, true
    );
  }
  if (status === 529 || (status === 400 && /credit|balance|billing/i.test(msg))) {
    throw new ApiError(
      `${t('apiErrors.noCredit')} (HTTP ${status}). <a href="${BILLING_URL}" target="_blank" rel="noopener">${t('apiErrors.topUp')}</a>`,
      status, true
    );
  }
  throw new ApiError(t('apiErrors.apiError', status, msg), status, false);
}

export class ApiError extends Error {
  constructor(message, status, isRateLimit = false) {
    super(message);
    this.status = status;
    this.isHtml = message.includes('<a ');
    this.isRateLimit = isRateLimit;
  }
}

export { BILLING_URL };

export async function validateApiKey(apiKey) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  });

  if (response.status === 401) return { valid: false, reason: 'invalid_key' };
  if (response.status === 429) return { valid: true, reason: 'rate_limited' };
  if (response.status === 400) {
    const err = await response.json().catch(() => ({}));
    if (/credit|balance|billing/i.test(err?.error?.message || '')) {
      return { valid: true, reason: 'no_credit' };
    }
  }
  return { valid: true, reason: 'ok' };
}

function buildRecipeAnalysisPrompt({ multiHint = false } = {}) {
  const lang = getLanguage();
  return lang === 'en'
    ? buildRecipeAnalysisPromptEN({ multiHint })
    : buildRecipeAnalysisPromptDE({ multiHint });
}

function buildRecipeAnalysisPromptDE({ multiHint = false } = {}) {
  let prompt = `Du bist ein Rezept-Analyse-Assistent. Analysiere den folgenden Inhalt und extrahiere strukturierte Informationen.

WICHTIG: Der Inhalt kann EIN oder MEHRERE Rezepte enthalten!
- Wenn der Inhalt MEHRERE Rezepte enthält, antworte mit einem JSON-ARRAY von Rezept-Objekten.
- Wenn der Inhalt nur EIN Rezept enthält, antworte mit einem einzelnen JSON-Objekt (kein Array).
- Wenn du den Inhalt NICHT lesen kannst oder KEIN Rezept erkennst, antworte mit einem leeren Array: []
- Erfinde NIEMALS Platzhalter-Rezepte. Lieber ein leeres Array als ein Rezept mit erfundenem Titel.

Jedes Rezept-Objekt hat folgende Felder:

{
  "title": "Name des Gerichts",
  "category": "Eine von: Vorspeise, Hauptspeise, Nachspeise, Fingerfood, Suppe, Salat, Beilage, Getränk, Snack, Brot/Gebäck, Gewürzmischungen, Kuchen, Soße, Sauerkonserven, Wurstrezept",
  "origin": "Länderküche z.B. Deutschland, Italien, USA, Ungarn, Frankreich, etc. oder 'International' wenn unklar",
  "prepTime": Gesamtzeit in Minuten als Zahl (Summe aus Vorbereitungszeit + Zubereitungszeit + Ruhezeit/Wartezeit/Marinierzeit/Backzeit – addiere ALLE genannten Zeitangaben). null nur wenn wirklich keine Zeitangabe vorhanden,
  "mainIngredient": "Hauptzutat z.B. Rind, Huhn, Schwein, Fisch, Gemüse, Pasta, etc.",
  "sides": ["Passende Beilagen als Array, z.B. Reis, Kartoffeln, Knödel, Salat, Brot"],
  "tags": ["Relevante Tags als Array, z.B. vegetarisch, vegan, schnell, glutenfrei, laktosefrei, Freitag-tauglich, festlich, Comfort Food, low-carb"],
  "ingredients": ["Alle Zutaten als Array"],
  "description": "Kurze Beschreibung des Gerichts in 1-2 Sätzen",
  "servings": Portionen als Zahl oder null,
  "difficulty": "Eine von: leicht, mittel, schwer",
  "recipeText": "Die vollständigen Zubereitungsschritte als reiner Text. Suche EXPLIZIT nach Abschnitten mit Überschriften wie 'Zubereitung', 'Anleitung', 'Instructions' o.ä. – der gesamte Inhalt dieser Abschnitte gehört vollständig hierher. KEIN Markdown, KEIN HTML, KEIN Titel, KEINE Zutatenliste (die steht bereits in 'ingredients'). Schritte durch Zeilenumbrüche trennen, z.B. '1. Schritt\\n2. Schritt'",
  "importNotes": "Inhalt aus Abschnitten 'Notizen', 'Tipps', 'Hinweise', 'Notes' o.ä. als reiner Text. null wenn kein solcher Abschnitt vorhanden"
}

Wichtige Regeln:
- Das Feld 'recipeText' darf NIEMALS leer sein – extrahiere alle Schritte vollständig aus dem Abschnitt 'Zubereitung'
- Wenn das Rezept kein Fleisch enthält, füge "Freitag-tauglich" zu den Tags hinzu
- Wenn die Zubereitungszeit unter 30 Minuten ist, füge "schnell" zu den Tags hinzu
- Für 'prepTime': Summiere ALLE Zeitangaben (Vorbereitungszeit + Zubereitungszeit + Ruhezeit + Marinierzeit + Backzeit etc.). Wenn z.B. "Vorbereitungszeit: 20 Min, Zubereitungszeit: 15 Min, Ruhezeit: 30 Min" steht, ist prepTime = 65. Schätze die Gesamtzeit wenn keine expliziten Angaben vorhanden
- Gewürzmischungen (z.B. Hähnchen-Gewürz, Gyros-Gewürz, Rubs, Marinaden-Mischungen) gehören in die Kategorie "Gewürzmischungen" – NICHT in "Beilage" oder "Snack". Bei Gewürzmischungen ist "sides" ein leeres Array.
- Trenne die Rezepte sauber voneinander – jedes bekommt seinen eigenen recipeText nur mit den Zubereitungsschritten
- Antworte NUR mit dem JSON, kein anderer Text`;

  if (multiHint) {
    prompt += `\n\nWICHTIG: Der Benutzer hat angegeben, dass diese Quelle MEHRERE Rezepte enthält. Analysiere den gesamten Inhalt sorgfältig und trenne ALLE Rezepte einzeln voneinander. Übersehe keines!`;
  }
  return prompt;
}

function buildRecipeAnalysisPromptEN({ multiHint = false } = {}) {
  let prompt = `You are a recipe analysis assistant. Analyse the following content and extract structured information.

IMPORTANT: The content may contain ONE or MULTIPLE recipes!
- If the content contains MULTIPLE recipes, respond with a JSON ARRAY of recipe objects.
- If the content contains only ONE recipe, respond with a single JSON object (no array).
- If you CANNOT read the content or recognise NO recipe, respond with an empty array: []
- NEVER invent placeholder recipes. An empty array is better than a recipe with a made-up title.

Each recipe object has the following fields:

{
  "title": "Name of the dish",
  "category": "One of: Starter, Main Course, Dessert, Finger Food, Soup, Salad, Side Dish, Drink, Snack, Bread & Pastry, Spice Blend, Cake, Sauce, Preserves, Sausage",
  "origin": "Cuisine origin e.g. Germany, Italy, USA, Hungary, France, etc. or 'International' if unclear",
  "prepTime": Total time in minutes as a number (sum of prep time + cooking time + resting/marinating/baking time – add ALL mentioned times). null only if truly no time is given,
  "mainIngredient": "Main ingredient e.g. beef, chicken, pork, fish, vegetables, pasta, etc.",
  "sides": ["Suitable side dishes as array, e.g. rice, potatoes, salad, bread"],
  "tags": ["Relevant tags as array, e.g. vegetarian, vegan, quick, gluten-free, lactose-free, Friday-friendly, festive, comfort food, low-carb"],
  "ingredients": ["All ingredients as array"],
  "description": "Short description of the dish in 1-2 sentences",
  "servings": Servings as number or null,
  "difficulty": "One of: leicht, mittel, schwer",
  "recipeText": "The complete preparation steps as plain text. EXPLICITLY look for sections headed 'Preparation', 'Instructions', 'Method', 'Directions' etc. – the entire content of those sections belongs here. NO Markdown, NO HTML, NO title, NO ingredient list (that is already in 'ingredients'). Separate steps with line breaks, e.g. '1. Step one\\n2. Step two'",
  "importNotes": "Content from sections 'Notes', 'Tips', 'Hints' etc. as plain text. null if no such section exists"
}

Important rules:
- The field 'recipeText' must NEVER be empty – extract all steps completely from the preparation section
- If the recipe contains no meat, add "Friday-friendly" to the tags
- If the preparation time is under 30 minutes, add "quick" to the tags
- For 'prepTime': Sum ALL time values (prep time + cooking time + resting time + marinating time + baking time etc.). If e.g. "Prep: 20 min, Cook: 15 min, Rest: 30 min" is stated, prepTime = 65. Estimate total time if no explicit values are given
- Spice blends (e.g. chicken seasoning, gyros spice, rubs, marinade mixes) belong in category "Spice Blend" – NOT in "Side Dish" or "Snack". For spice blends, "sides" is an empty array.
- Separate recipes cleanly – each gets its own recipeText with only its preparation steps
- Respond ONLY with the JSON, no other text`;

  if (multiHint) {
    prompt += `\n\nIMPORTANT: The user has indicated that this source contains MULTIPLE recipes. Analyse the entire content carefully and separate ALL recipes individually. Don't miss any!`;
  }
  return prompt;
}

export async function analyzeRecipeText(text, { multiHint = false } = {}) {
  const apiKey = await getApiKey();

  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `${buildRecipeAnalysisPrompt({ multiHint })}\n\nHier ist der Text:\n\n${text}`
        }]
      })
    });
  } catch (fetchErr) {
    const msg = fetchErr.name === 'AbortError' ? t('apiErrors.timeout') : fetchErr.message;
    console.error('[API] Fetch error:', msg);
    throw new ApiError(msg, 0, false);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseRecipeResponse(content);
}

export async function analyzeRecipeImages(images, { multiHint = false } = {}) {
  const apiKey = await getApiKey();

  const contentParts = [];
  for (const img of images) {
    contentParts.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
    });
  }
  const imageHintDE = `

Analysiere die Rezepte in den Bildern. Wichtige Hinweise:
- Die Bilder können HANDGESCHRIEBENE Rezepte enthalten – auch Bleistift, Kugelschreiber, kursive oder unordentliche Schrift.
- Lies JEDEN erkennbaren Text – auch wenn er schwer leserlich ist. Vervollständige abgekürzte Wörter sinnvoll aus dem Koch-Kontext.
- Gib NIE ein leeres Array [] zurück, nur weil die Schrift handgeschrieben ist. Versuche immer, das Rezept so gut wie möglich zu extrahieren.
- Wenn einzelne Wörter unleserlich sind, schreibe "[unleserlich]" statt sie wegzulassen.
- Ein Bild kann mehrere Rezepte enthalten, die durch Überschriften oder Trennlinien voneinander abgegrenzt sind.
- Suche EXPLIZIT nach dem Abschnitt "Zubereitung" im Bild und übertrage dessen Inhalt vollständig in das Feld recipeText.
- Suche nach Zutaten-Listen (oft nummeriert oder mit Mengenangaben wie "200g", "3 EL", "1 TL" usw.).`;

  const imageHintEN = `

Analyse the recipes in the images. Important notes:
- Images may contain HANDWRITTEN recipes – including pencil, ballpoint, cursive or messy writing.
- Read EVERY recognisable piece of text – even if it is difficult to read. Complete abbreviated words sensibly from a cooking context.
- NEVER return an empty array [] just because the handwriting is handwritten. Always try to extract the recipe as best you can.
- If individual words are illegible, write "[illegible]" rather than omitting them.
- One image may contain multiple recipes separated by headings or dividing lines.
- EXPLICITLY look for the preparation section in the image and copy its content fully into the recipeText field.
- Look for ingredient lists (often numbered or with quantities like "200g", "3 tbsp", "1 tsp" etc.).`;

  contentParts.push({
    type: 'text',
    text: buildRecipeAnalysisPrompt({ multiHint }) + (getLanguage() === 'en' ? imageHintEN : imageHintDE)
  });

  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [{ role: 'user', content: contentParts }]
      })
    });
  } catch (fetchErr) {
    const msg = fetchErr.name === 'AbortError' ? t('apiErrors.timeout') : fetchErr.message;
    console.error('[API] Fetch error:', msg);
    throw new ApiError(msg, 0, false);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseRecipeResponse(content);
}

// Legacy single-image wrapper
export async function analyzeRecipeImage(base64Data, mediaType, { multiHint = false } = {}) {
  return analyzeRecipeImages([{ base64: base64Data, mediaType }], { multiHint });
}

/**
 * Parst die API-Antwort und gibt immer ein Array von Rezepten zurück.
 * Erkennt sowohl einzelne Objekte als auch Arrays.
 * Entfernt Markdown-Code-Fences falls vorhanden.
 */
function parseRecipeResponse(content) {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch { /* fallback to regex extraction */ }

  // Try array regex first (catches [] for empty)
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* continue */ }
  }

  // Try object regex (single recipe)
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* continue */ }
  }

  throw new Error(t('apiErrors.parseError'));
}

/**
 * Parses a voice transcript to extract a recipe import intent.
 * Returns { url, site, query } – all fields may be null.
 */
export async function parseVoiceIntent(transcript) {
  const apiKey = await getApiKey();

  const systemPrompt = `You are a recipe import assistant. Extract the recipe import intent from the user's voice command.
Return ONLY a JSON object with these fields:
{
  "url": "<full URL if the user explicitly stated one, otherwise null>",
  "site": "<website domain like 'chefkoch.de' if mentioned, otherwise null>",
  "query": "<the recipe name to search for, or null>"
}

Examples:
- "Importier die Bärlauchpalatschinken von Chefkoch" → {"url":null,"site":"chefkoch.de","query":"Bärlauchpalatschinken"}
- "import garlic soup from allrecipes.com" → {"url":null,"site":"allrecipes.com","query":"garlic soup"}
- "get me https://www.chefkoch.de/rezepte/12345" → {"url":"https://www.chefkoch.de/rezepte/12345","site":null,"query":null}
- "Tiramisu importieren" → {"url":null,"site":null,"query":"Tiramisu"}

Return ONLY the JSON, no markdown, no explanation.`;

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() || '{}';
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text;
  try {
    return JSON.parse(cleaned);
  } catch {
    return { url: null, site: null, query: transcript };
  }
}

/**
 * Filtert ungültige/sinnlose Rezepte aus den API-Ergebnissen.
 * Gibt { valid: [...], filtered: number } zurück.
 */
const INVALID_TITLE_PATTERNS = /konnte nicht|nicht lesbar|unleserlich|kein rezept|nicht erkannt|nicht lesen|unbekannt|placeholder|example|test/i;

export function validateRecipeResults(results) {
  const valid = [];
  let filtered = 0;

  for (const r of results) {
    if (!r || typeof r !== 'object') { filtered++; continue; }
    if (!r.title || r.title.trim().length < 2) { filtered++; continue; }
    if (INVALID_TITLE_PATTERNS.test(r.title)) { filtered++; continue; }
    if ((!r.ingredients || r.ingredients.length === 0) && (!r.recipeText || r.recipeText.trim().length < 20)) { filtered++; continue; }
    valid.push(r);
  }

  return { valid, filtered };
}

export async function suggestRecipes(question, recipes) {
  const apiKey = await getApiKey();

  const recipeSummaries = recipes.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    origin: r.origin,
    prepTime: r.prepTime,
    mainIngredient: r.mainIngredient,
    sides: r.sides,
    tags: r.tags,
    ingredients: r.ingredients,
    difficulty: r.difficulty,
    lastCooked: r.cookedDates?.length ? r.cookedDates[r.cookedDates.length - 1] : null,
    cookedCount: r.cookedCount
  }));

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: getLanguage() === 'en'
          ? `You are a cooking assistant. The user has the following question:\n\n"${question}"\n\nHere are the available recipes:\n${JSON.stringify(recipeSummaries, null, 2)}\n\nToday is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.\n\nChoose the most suitable recipes and respond ONLY with a JSON array. Each element should contain:\n[\n  {\n    "id": recipe ID,\n    "matchReasons": ["Reason 1 why this recipe fits", "Reason 2", ...]\n  }\n]\n\nRules:\n- Sort by relevance (best matches first)\n- Recipes cooked recently (lastCooked) should be sorted further down\n- For "no meat" or "Friday": only recipes with tag "Friday-friendly" or without a meat main ingredient\n- For time constraints: filter by prepTime\n- Return at most 10 recipes\n- Respond ONLY with the JSON array`
          : `Du bist ein Koch-Assistent. Der Nutzer hat folgende Frage:\n\n"${question}"\n\nHier sind die verfügbaren Rezepte:\n${JSON.stringify(recipeSummaries, null, 2)}\n\nHeute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.\n\nWähle die passendsten Rezepte aus und antworte NUR mit einem JSON-Array. Jedes Element soll folgendes enthalten:\n[\n  {\n    "id": Rezept-ID,\n    "matchReasons": ["Grund 1 warum dieses Rezept passt", "Grund 2", ...]\n  }\n]\n\nRegeln:\n- Sortiere nach Relevanz (beste Treffer zuerst)\n- Rezepte die kürzlich gekocht wurden (lastCooked), sollen weiter hinten einsortiert werden\n- Bei "kein Fleisch" oder "Freitag": nur Rezepte mit Tag "Freitag-tauglich" oder ohne Fleisch-Hauptzutat\n- Bei Zeitangaben: filtere nach prepTime\n- Gib maximal 10 Rezepte zurück\n- Antworte NUR mit dem JSON-Array`
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const content = data.content[0].text;

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error(t('apiErrors.parseError'));
  }
}
