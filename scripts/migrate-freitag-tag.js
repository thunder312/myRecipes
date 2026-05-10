#!/usr/bin/env node
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const FISH_KEYWORDS = [
  'fisch', 'thunfisch', 'lachs', 'krabben', 'sushi', 'forelle', 'hering',
  'sardine', 'garnele', 'shrimp', 'seelachs', 'dorsch', 'kabeljau', 'heilbutt',
  'muschel', 'tintenfisch', 'calamari', 'krebs', 'meeresfrüchte', 'seafood',
];

function isFishRecipe(title) {
  const lower = title.toLowerCase();
  return FISH_KEYWORDS.some(k => lower.includes(k));
}

const dbPath = process.argv[2] || path.join(__dirname, '..', 'data', 'recipes.db');
const dryRun = process.argv.includes('--dry-run');

console.log(`DB: ${dbPath}`);
console.log(`Modus: ${dryRun ? 'DRY RUN (keine Änderungen)' : 'LIVE'}\n`);

const db = new Database(dbPath);

const rows = db.prepare(
  "SELECT id, title, tags FROM recipes WHERE tags LIKE '%Freitag-tauglich%'"
).all();

console.log(`Betroffene Rezepte: ${rows.length}\n`);

const update = db.prepare('UPDATE recipes SET tags = ? WHERE id = ?');
const updates = db.transaction(changes => {
  for (const { id, sql, newTags } of changes) {
    update.run(sql, id);
  }
});

const changes = [];
const stats = { removed: 0, addedVeg: 0, addedFish: 0 };

for (const row of rows) {
  let tags;
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    console.warn(`  SKIP ${row.id} "${row.title}" – ungültige JSON-Tags`);
    continue;
  }

  if (!tags.includes('Freitag-tauglich')) continue;

  const newTags = tags.filter(t => t !== 'Freitag-tauglich');
  const hasVeg = tags.some(t => ['vegetarisch', 'vegan'].includes(t.toLowerCase()));
  let action = 'nur entfernt';

  if (!hasVeg) {
    if (isFishRecipe(row.title)) {
      if (!newTags.includes('Fisch')) {
        newTags.push('Fisch');
        stats.addedFish++;
        action = '→ Fisch ergänzt';
      }
    } else {
      newTags.push('vegetarisch');
      stats.addedVeg++;
      action = '→ vegetarisch ergänzt';
    }
  } else {
    stats.removed++;
  }

  console.log(`  [${row.id}] "${row.title}" (${action})`);
  changes.push({ id: row.id, sql: JSON.stringify(newTags), newTags });
}

console.log(`\nZusammenfassung:`);
console.log(`  Nur entfernt (hatte bereits vegetarisch/vegan): ${stats.removed}`);
console.log(`  vegetarisch ergänzt: ${stats.addedVeg}`);
console.log(`  Fisch ergänzt:       ${stats.addedFish}`);

if (!dryRun && changes.length > 0) {
  updates(changes);
  console.log(`\n✓ ${changes.length} Rezepte aktualisiert.`);
} else if (dryRun) {
  console.log('\n(Dry run – keine Änderungen gespeichert)');
}

db.close();
