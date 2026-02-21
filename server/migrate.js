#!/usr/bin/env node

// Importiert ein bestehendes JSON-Backup (aus dem Browser-Export) in die SQLite-Datenbank.
// Verwendung: node server/migrate.js pfad/zu/backup.json

const fs = require('fs');
const { importAll, getDB } = require('./db');

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Verwendung: node server/migrate.js <backup.json>');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`Datei nicht gefunden: ${backupFile}`);
  process.exit(1);
}

console.log(`Lese Backup aus ${backupFile}...`);
const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

if (!data.recipes || !data.settings) {
  console.error('Ungültiges Backup-Format (recipes und settings erwartet).');
  process.exit(1);
}

console.log(`Gefunden: ${data.recipes.length} Rezepte, ${data.settings.length} Einstellungen`);

// Initialize DB
getDB();

// Import
importAll(data);

console.log('Migration abgeschlossen!');
