#!/usr/bin/env node
/**
 * Entfernt alle automatisch per Pixabay-Suche zugewiesenen Bilder aus der DB.
 * Betrifft nur Rezepte mit imageSource = 'auto'.
 *
 * Verwendung:
 *   node scripts/remove-auto-images.js          # Dry-Run (zeigt nur, was gelöscht würde)
 *   node scripts/remove-auto-images.js --apply  # Führt die Löschung wirklich durch
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'recipes.db');
const apply = process.argv.includes('--apply');

const db = new Database(DB_PATH, { readonly: !apply });

const affected = db
  .prepare("SELECT id, title FROM recipes WHERE imageSource = 'auto'")
  .all();

if (affected.length === 0) {
  console.log('Keine Rezepte mit imageSource = "auto" gefunden. Nichts zu tun.');
  db.close();
  process.exit(0);
}

console.log(`\n${apply ? 'LÖSCHE' : 'DRY-RUN – würde löschen'}: ${affected.length} Bild(er) mit imageSource = "auto"\n`);
affected.forEach(r => console.log(`  [${r.id}] ${r.title}`));

if (!apply) {
  console.log('\nKein --apply Flag gesetzt. Keine Änderungen vorgenommen.');
  console.log('Zum tatsächlichen Löschen:\n  node scripts/remove-auto-images.js --apply\n');
  db.close();
  process.exit(0);
}

const stmt = db.prepare(
  "UPDATE recipes SET imageBlob = NULL, imageMimeType = NULL, imageSource = NULL, updatedAt = ? WHERE imageSource = 'auto'"
);
const result = stmt.run(new Date().toISOString());

console.log(`\nFertig: ${result.changes} Bild(er) entfernt.`);
db.close();
