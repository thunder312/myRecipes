import { getSetting } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const BILLING_URL = 'https://console.anthropic.com/settings/billing';

async function getApiKey() {
  const key = await getSetting('apiKey');
  if (!key) throw new Error('Kein API-Key gesetzt. Bitte unter Einstellungen hinterlegen.');
  return key;
}

function handleApiError(response, errBody) {
  const status = response.status;
  const msg = errBody?.error?.message || response.statusText;

  if (status === 401) {
    throw new ApiError('Ungültiger API-Key. Bitte in den Einstellungen prüfen.', status);
  }
  if (status === 429 || (status === 400 && /credit|balance|billing/i.test(msg))) {
    throw new ApiError(
      `Kein Guthaben oder Rate-Limit erreicht. <a href="${BILLING_URL}" target="_blank" rel="noopener">Guthaben aufladen</a>`,
      status
    );
  }
  throw new ApiError(`API-Fehler: ${msg}`, status);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.isHtml = message.includes('<a ');
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

function buildRecipeAnalysisPrompt() {
  return `Du bist ein Rezept-Analyse-Assistent. Analysiere den folgenden Text und extrahiere strukturierte Informationen.

WICHTIG: Der Text kann EIN oder MEHRERE Rezepte enthalten!
- Wenn der Text MEHRERE Rezepte enthält, antworte mit einem JSON-ARRAY von Rezept-Objekten.
- Wenn der Text nur EIN Rezept enthält, antworte mit einem einzelnen JSON-Objekt (kein Array).

Jedes Rezept-Objekt hat folgende Felder:

{
  "title": "Name des Gerichts",
  "category": "Eine von: Vorspeise, Hauptspeise, Nachspeise, Fingerfood, Suppe, Salat, Beilage, Getränk, Snack, Brot/Gebäck, Gewürzmischungen, Kuchen, Soße, Sauerkonserven, Wurstrezept",
  "origin": "Länderküche z.B. Deutschland, Italien, USA, Ungarn, Frankreich, etc. oder 'International' wenn unklar",
  "prepTime": Zubereitungszeit in Minuten als Zahl oder null wenn unbekannt,
  "mainIngredient": "Hauptzutat z.B. Rind, Huhn, Schwein, Fisch, Gemüse, Pasta, etc.",
  "sides": ["Passende Beilagen als Array, z.B. Reis, Kartoffeln, Knödel, Salat, Brot"],
  "tags": ["Relevante Tags als Array, z.B. vegetarisch, vegan, schnell, glutenfrei, laktosefrei, Freitag-tauglich, festlich, Comfort Food, low-carb"],
  "ingredients": ["Alle Zutaten als Array"],
  "description": "Kurze Beschreibung des Gerichts in 1-2 Sätzen",
  "servings": Portionen als Zahl oder null,
  "difficulty": "Eine von: leicht, mittel, schwer",
  "recipeText": "Das vollständige Rezept (Zutaten + Anleitung) als formatierter Text"
}

Wichtige Regeln:
- Wenn das Rezept kein Fleisch enthält, füge "Freitag-tauglich" zu den Tags hinzu
- Wenn die Zubereitungszeit unter 30 Minuten ist, füge "schnell" zu den Tags hinzu
- Schätze die Zubereitungszeit wenn möglich, auch wenn sie nicht explizit angegeben ist
- Gewürzmischungen (z.B. Hähnchen-Gewürz, Gyros-Gewürz, Rubs, Marinaden-Mischungen) gehören in die Kategorie "Gewürzmischungen" – NICHT in "Beilage" oder "Snack". Bei Gewürzmischungen ist "sides" ein leeres Array.
- Trenne die Rezepte sauber voneinander – jedes bekommt seinen eigenen recipeText mit Zutaten + Anleitung
- Antworte NUR mit dem JSON, kein anderer Text`;
}

export async function analyzeRecipeText(text) {
  const apiKey = await getApiKey();

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
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `${buildRecipeAnalysisPrompt()}\n\nHier ist der Text:\n\n${text}`
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseRecipeResponse(content);
}

export async function analyzeRecipeImage(base64Data, mediaType) {
  const apiKey = await getApiKey();

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
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data }
          },
          {
            type: 'text',
            text: buildRecipeAnalysisPrompt() + '\n\nAnalysiere die Rezepte im Bild.'
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    handleApiError(response, err);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseRecipeResponse(content);
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
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* fallback to regex extraction */ }

  // Try object regex first (single recipe is most common)
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* continue */ }
  }

  // Try array regex (multiple recipes)
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* continue */ }
  }

  throw new Error('Konnte die KI-Antwort nicht verarbeiten.');
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
        content: `Du bist ein Koch-Assistent. Der Nutzer hat folgende Frage:

"${question}"

Hier sind die verfügbaren Rezepte:
${JSON.stringify(recipeSummaries, null, 2)}

Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

Wähle die passendsten Rezepte aus und antworte NUR mit einem JSON-Array. Jedes Element soll folgendes enthalten:
[
  {
    "id": Rezept-ID,
    "matchReasons": ["Grund 1 warum dieses Rezept passt", "Grund 2", ...]
  }
]

Regeln:
- Sortiere nach Relevanz (beste Treffer zuerst)
- Rezepte die kürzlich gekocht wurden (lastCooked), sollen weiter hinten einsortiert werden
- Bei "kein Fleisch" oder "Freitag": nur Rezepte mit Tag "Freitag-tauglich" oder ohne Fleisch-Hauptzutat
- Bei Zeitangaben: filtere nach prepTime
- Gib maximal 10 Rezepte zurück
- Antworte NUR mit dem JSON-Array`
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
    throw new Error('Konnte die KI-Antwort nicht verarbeiten.');
  }
}
