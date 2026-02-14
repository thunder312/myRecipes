import { getSetting } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

async function getApiKey() {
  const key = await getSetting('apiKey');
  if (!key) throw new Error('Kein API-Key gesetzt. Bitte unter Einstellungen hinterlegen.');
  return key;
}

function buildRecipeAnalysisPrompt() {
  return `Du bist ein Rezept-Analyse-Assistent. Analysiere das folgende Rezept und extrahiere strukturierte Informationen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown, kein Text drumherum) mit folgenden Feldern:

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
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${buildRecipeAnalysisPrompt()}\n\nHier ist das Rezept:\n\n${text}`
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
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Konnte die KI-Antwort nicht verarbeiten.');
  }
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
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data }
          },
          {
            type: 'text',
            text: buildRecipeAnalysisPrompt() + '\n\nAnalysiere das Rezept im Bild.'
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

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Konnte die KI-Antwort nicht verarbeiten.');
  }
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
