#!/usr/bin/env node
/**
 * Migration: neue Kategorien Frühstück, Dip, Süßkonserven
 *
 * Dry-Run (nur anzeigen):  node scripts/migrate-new-categories.js
 * Anwenden:                node scripts/migrate-new-categories.js --apply
 */

const { getDB } = require('../server/db.js');

const apply = process.argv.includes('--apply');
const db = getDB();

// Geplante Umkategorisierungen: [id, neueKategorie, Begründung]
const CHANGES = [
  // Dip: Hummus-Rezepte waren unter Vorspeise
  [21,  'Dip', 'Hummus – typischer Dip, nicht Vorspeise'],
  [22,  'Dip', 'Hummus-Variation – typischer Dip'],
  [23,  'Dip', 'Hummus/Tahin – typischer Dip'],
  // Dip: Tzatziki war unter Beilage
  [36,  'Dip', 'Tzatziki – typischer Dip, nicht Beilage'],
  // Dip: Aioli war unter Soße
  [233, 'Dip', 'Aioli – typischer Dip, nicht Soße'],
  // Süßkonserven: Pfirsichmarmelade war fälschlicherweise unter Sauerkonserven
  [205, 'Süßkonserven', 'Pfirsichmarmelade – gehört zu Süßkonserven, nicht Sauerkonserven'],
];

console.log(apply ? '=== ANWENDEN ===' : '=== DRY-RUN (nur Vorschau) ===');
console.log('');

const stmt = db.prepare('UPDATE recipes SET category = ? WHERE id = ?');
const get  = db.prepare('SELECT id, title, category FROM recipes WHERE id = ?');

let changed = 0;
for (const [id, newCat, reason] of CHANGES) {
  const recipe = get.get(id);
  if (!recipe) {
    console.log(`  [${id}] NICHT GEFUNDEN – übersprungen`);
    continue;
  }
  if (recipe.category === newCat) {
    console.log(`  [${id}] "${recipe.title}" → bereits "${newCat}" ✓`);
    continue;
  }
  console.log(`  [${id}] "${recipe.title}"`);
  console.log(`        ${recipe.category || '(keine)'} → ${newCat}`);
  console.log(`        Grund: ${reason}`);
  if (apply) {
    stmt.run(newCat, id);
    changed++;
  }
}

console.log('');
if (apply) {
  console.log(`✓ ${changed} Rezept(e) aktualisiert.`);
} else {
  console.log(`→ Zum Anwenden: node scripts/migrate-new-categories.js --apply`);
}
