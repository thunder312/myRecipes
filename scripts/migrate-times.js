/**
 * Liest alle Rezepte mit prepTime aber ohne workTime/cookTime/restTime
 * und lässt Claude die Gesamtzeit aufteilen.
 *
 * Aufruf (Testmodus, kein Schreiben):
 *   node scripts/migrate-times.js
 *
 * Aufruf (Änderungen wirklich speichern):
 *   node scripts/migrate-times.js --write
 */

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'recipes.db');
const WRITE_MODE = process.argv.includes('--write');
const DELAY_MS = 500; // Pause zwischen API-Calls

// --- DB ---

const db = new Database(DB_PATH);

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function getRecipesToMigrate() {
  return db.prepare(`
    SELECT id, title, prepTime, recipeText
    FROM recipes
    WHERE prepTime IS NOT NULL
      AND prepTime > 0
      AND (workTime IS NULL OR workTime = 0)
      AND (cookTime IS NULL OR cookTime = 0)
      AND (restTime IS NULL OR restTime = 0)
      AND recipeText IS NOT NULL
      AND LENGTH(TRIM(recipeText)) > 30
    ORDER BY title
  `).all();
}

function updateTimes(id, workTime, cookTime, restTime) {
  db.prepare(
    'UPDATE recipes SET workTime = ?, cookTime = ?, restTime = ?, updatedAt = ? WHERE id = ?'
  ).run(workTime || null, cookTime || null, restTime || null, new Date().toISOString(), id);
}

// --- Claude API ---

function callClaude(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.content?.[0]?.text || '';
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildPrompt(title, recipeText, prepTime) {
  return `Du analysierst ein Rezept und schätzt, wie sich die Gesamtzeit auf drei Kategorien aufteilt.

Rezept: "${title}"
Gesamtzeit: ${prepTime} Minuten

Zubereitungstext:
${recipeText.slice(0, 1500)}

Teile die ${prepTime} Minuten auf diese drei Kategorien auf:
- workTime: Aktive Arbeitszeit (Schneiden, Rühren, Formen – nicht passives Warten)
- cookTime: Koch-/Backzeit (Herd, Ofen, Pfanne)
- restTime: Ruhezeit (Marinieren, Kühlen, Gehzeit, Ziehen lassen, Übernacht)

Regeln:
- workTime + cookTime + restTime muss EXAKT ${prepTime} ergeben
- Kategorien die nicht zutreffen: auf 0 setzen (nicht null)
- Antworte NUR mit JSON, kein anderer Text: {"workTime": X, "cookTime": Y, "restTime": Z}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(min) {
  if (!min) return '–';
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

// --- Main ---

async function main() {
  const apiKey = getSetting('apiKey');
  if (!apiKey) {
    console.error('Kein API-Key in der Datenbank gefunden. Bitte zuerst in den Einstellungen hinterlegen.');
    process.exit(1);
  }

  const recipes = getRecipesToMigrate();
  console.log(`\n${recipes.length} Rezepte gefunden (prepTime gesetzt, Einzelzeiten fehlen)\n`);

  if (recipes.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }

  if (WRITE_MODE) {
    console.log('*** SCHREIBMODUS – Änderungen werden gespeichert ***\n');
  } else {
    console.log('*** TESTMODUS – keine Änderungen werden gespeichert ***');
    console.log('    Mit --write ausführen um zu speichern.\n');
  }

  const results = [];
  let errors = 0;

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    process.stdout.write(`[${i + 1}/${recipes.length}] ${recipe.title} ... `);

    try {
      const prompt = buildPrompt(recipe.title, recipe.recipeText, recipe.prepTime);
      const raw = await callClaude(apiKey, prompt);

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Ungültige Antwort: ${raw.slice(0, 100)}`);

      const times = JSON.parse(match[0]);
      const { workTime = 0, cookTime = 0, restTime = 0 } = times;
      const sum = (workTime || 0) + (cookTime || 0) + (restTime || 0);

      if (sum !== recipe.prepTime) {
        console.log(`WARNUNG (Summe ${sum} ≠ ${recipe.prepTime})`);
      } else {
        console.log('OK');
      }

      results.push({ recipe, workTime, cookTime, restTime, sum });

      if (WRITE_MODE) {
        updateTimes(recipe.id, workTime || null, cookTime || null, restTime || null);
      }
    } catch (err) {
      console.log(`FEHLER: ${err.message}`);
      errors++;
      results.push({ recipe, error: err.message });
    }

    if (i < recipes.length - 1) await sleep(DELAY_MS);
  }

  // --- Ausgabe ---
  console.log('\n' + '='.repeat(70));
  console.log('ERGEBNIS\n');

  const maxTitleLen = Math.min(35, Math.max(...results.map(r => r.recipe.title.length)));

  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.recipe.title.padEnd(maxTitleLen)}  FEHLER: ${r.error}`);
      continue;
    }
    const title = r.recipe.title.padEnd(maxTitleLen);
    const gesamt = `Gesamt: ${formatTime(r.recipe.prepTime)}`.padEnd(18);
    const parts = [
      r.workTime ? `Arbeit: ${formatTime(r.workTime)}` : null,
      r.cookTime ? `Koch/Back: ${formatTime(r.cookTime)}` : null,
      r.restTime ? `Ruhe: ${formatTime(r.restTime)}` : null,
    ].filter(Boolean).join('  ');
    const sumOk = r.sum === r.recipe.prepTime ? '' : ` ⚠ Summe=${r.sum}`;
    console.log(`  ${title}  ${gesamt}  →  ${parts || '(keine Aufteilung)'}${sumOk}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`${results.filter(r => !r.error).length} verarbeitet, ${errors} Fehler`);
  if (!WRITE_MODE) {
    console.log('\nZum Speichern: node scripts/migrate-times.js --write');
  } else {
    console.log('\nAlle Änderungen wurden in der Datenbank gespeichert.');
  }
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
