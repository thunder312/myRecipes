import { getSetting } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

async function getApiKey() {
  const key = await getSetting('apiKey');
  if (!key) throw new Error('Kein API-Key gesetzt. Bitte unter Einstellungen hinterlegen.');
  return key;
}

function buildRecipeAnalysisPrompt() {
  return `Du bist ein Rezept-Analyse-Assistent. Analysiere den folgenden Text und extrahiere strukturierte Informationen.

WICHTIG: Der Text kann EIN oder MEHRERE Rezepte enthalten!
- Wenn der Text MEHRERE Rezepte enthält, antworte mit einem JSON-ARRAY von Rezept-Objekten.
- Wenn der Text nur EIN Rezept enthält, antworte mit einem einzelnen JSON-Objekt (kein Array).

Jedes Rezept-Objekt hat folgende Felder:

{
  "title": "Name des Gerichts",
  "category": "Eine von: Vorspeise, Hauptspeise, Nachspeise, Fingerfood, Suppe, Salat, Beilage, Getränk, Snack, Brot/Gebäck",
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
    throw new Error(`API-Fehler: ${err.error?.message || response.statusText}`);
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
    throw new Error(`API-Fehler: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseRecipeResponse(content);
}

/**
 * Parst die API-Antwort und gibt immer ein Array von Rezepten zurück.
 * Erkennt sowohl einzelne Objekte als auch Arrays.
 */
function parseRecipeResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from surrounding text
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      parsed = JSON.parse(arrayMatch[0]);
    } else {
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        throw new Error('Konnte die KI-Antwort nicht verarbeiten.');
      }
    }
  }
  // Normalize: always return an array
  return Array.isArray(parsed) ? parsed : [parsed];
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
    throw new Error(`API-Fehler: ${err.error?.message || response.statusText}`);
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
