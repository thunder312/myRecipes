const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'recipes.db');

let db = null;

function getDB() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    migrateSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      origin TEXT,
      prepTime INTEGER,
      mainIngredient TEXT,
      sides TEXT,
      tags TEXT,
      ingredients TEXT,
      description TEXT,
      servings INTEGER,
      difficulty TEXT,
      recipeText TEXT,
      sourceType TEXT,
      sourceRef TEXT,
      sourceNote TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      cookedDates TEXT,
      cookedCount INTEGER DEFAULT 0,
      notes TEXT,
      pdfBlob BLOB,
      thumbnailBlob BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
    CREATE INDEX IF NOT EXISTS idx_recipes_origin ON recipes(origin);
    CREATE INDEX IF NOT EXISTS idx_recipes_mainIngredient ON recipes(mainIngredient);
    CREATE INDEX IF NOT EXISTS idx_recipes_createdAt ON recipes(createdAt);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cookbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      coverTitle TEXT,
      coverSubtitle TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_cookbooks (
      recipeId INTEGER NOT NULL,
      cookbookId INTEGER NOT NULL,
      PRIMARY KEY (recipeId, cookbookId),
      FOREIGN KEY (recipeId) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (cookbookId) REFERENCES cookbooks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      createdAt TEXT NOT NULL
    );
  `);
}

function migrateSchema() {
  const cols = db.pragma('table_info(recipes)').map(r => r.name);
  if (!cols.includes('sourceNote')) {
    db.exec('ALTER TABLE recipes ADD COLUMN sourceNote TEXT');
  }

  // Ensure passwordHash column exists in users table (added in multi-user migration)
  const userCols = db.pragma('table_info(users)').map(r => r.name);
  if (!userCols.includes('passwordHash')) {
    db.exec('ALTER TABLE users ADD COLUMN passwordHash TEXT NOT NULL DEFAULT \'\'');
  }

  // Ensure Standard cookbook exists
  const standard = db.prepare('SELECT id FROM cookbooks WHERE id = 1').get();
  if (!standard) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cookbooks (id, name, description, coverTitle, coverSubtitle, createdAt)
       VALUES (1, 'Standard', 'Alle Rezepte', 'Meine Rezepte', '', ?)`
    ).run(now);
  }

  // Assign all recipes not yet in any cookbook to Standard
  db.exec(`
    INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId)
    SELECT id, 1 FROM recipes
    WHERE id NOT IN (SELECT recipeId FROM recipe_cookbooks)
  `);

  // Migrate single master password → admin user
  const userCount = getDB().prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const now = new Date().toISOString();
    const existingHash = getSetting('passwordHash');
    const adminHash = existingHash || hashPassword('admin');
    getDB().prepare(
      'INSERT INTO users (username, passwordHash, role, createdAt) VALUES (?, ?, ?, ?)'
    ).run('admin', adminHash, 'admin', now);
    if (existingHash) {
      getDB().prepare("DELETE FROM settings WHERE key = 'passwordHash'").run();
    }
  }
}

// --- JSON array fields ---

const JSON_FIELDS = ['sides', 'tags', 'ingredients', 'cookedDates', 'notes'];

function serializeRecipe(recipe) {
  const row = { ...recipe };
  for (const field of JSON_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) {
      row[field] = JSON.stringify(row[field]);
    }
  }
  // Convert base64 blobs to Buffer
  if (typeof row.pdfBlob === 'string' && row.pdfBlob.length > 0) {
    row.pdfBlob = Buffer.from(row.pdfBlob, 'base64');
  } else if (!Buffer.isBuffer(row.pdfBlob)) {
    row.pdfBlob = null;
  }
  if (typeof row.thumbnailBlob === 'string' && row.thumbnailBlob.length > 0) {
    row.thumbnailBlob = Buffer.from(row.thumbnailBlob, 'base64');
  } else if (!Buffer.isBuffer(row.thumbnailBlob)) {
    row.thumbnailBlob = null;
  }
  return row;
}

function deserializeRecipe(row) {
  if (!row) return null;
  const recipe = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof recipe[field] === 'string') {
      try { recipe[field] = JSON.parse(recipe[field]); }
      catch { recipe[field] = []; }
    } else {
      recipe[field] = recipe[field] || [];
    }
  }
  // Convert Buffer blobs to base64
  if (Buffer.isBuffer(recipe.pdfBlob)) {
    recipe.pdfBlob = recipe.pdfBlob.toString('base64');
  } else {
    recipe.pdfBlob = null;
  }
  if (Buffer.isBuffer(recipe.thumbnailBlob)) {
    recipe.thumbnailBlob = recipe.thumbnailBlob.toString('base64');
  } else {
    recipe.thumbnailBlob = null;
  }
  return recipe;
}

// --- Recipes ---

function getAllRecipes() {
  const rows = getDB().prepare('SELECT * FROM recipes ORDER BY createdAt DESC').all();
  return rows.map(deserializeRecipe);
}

function getRecipe(id) {
  const row = getDB().prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  return deserializeRecipe(row);
}

function addRecipe(recipe, extraCookbookIds = []) {
  const now = new Date().toISOString();
  const data = serializeRecipe({
    ...recipe,
    createdAt: now,
    updatedAt: now,
    cookedDates: recipe.cookedDates || [],
    cookedCount: recipe.cookedCount || 0,
    notes: recipe.notes || [],
  });
  // Remove id so AUTOINCREMENT assigns one
  delete data.id;

  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(c => data[c]);

  const d = getDB();
  const stmt = d.prepare(
    `INSERT INTO recipes (${columns.join(', ')}) VALUES (${placeholders})`
  );
  const result = stmt.run(...values);
  const newId = result.lastInsertRowid;

  // Always assign to Standard cookbook (id=1) plus any extras
  const cookbookIds = [1, ...extraCookbookIds.filter(id => id !== 1)];
  const cbStmt = d.prepare('INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) VALUES (?, ?)');
  for (const cbId of cookbookIds) {
    cbStmt.run(newId, cbId);
  }

  return newId;
}

function updateRecipe(recipe) {
  const data = serializeRecipe({
    ...recipe,
    updatedAt: new Date().toISOString(),
  });
  const id = data.id;
  delete data.id;

  const columns = Object.keys(data);
  const setClause = columns.map(c => `${c} = ?`).join(', ');
  const values = columns.map(c => data[c]);

  getDB().prepare(`UPDATE recipes SET ${setClause} WHERE id = ?`).run(...values, id);
}

function deleteRecipe(id) {
  getDB().prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

// --- Cookbooks ---

function getAllCookbooks() {
  return getDB().prepare('SELECT * FROM cookbooks ORDER BY id ASC').all();
}

function getCookbook(id) {
  return getDB().prepare('SELECT * FROM cookbooks WHERE id = ?').get(id);
}

function addCookbook(cookbook) {
  const now = new Date().toISOString();
  const result = getDB().prepare(
    `INSERT INTO cookbooks (name, description, coverTitle, coverSubtitle, createdAt)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    cookbook.name || 'Neues Kochbuch',
    cookbook.description || '',
    cookbook.coverTitle || cookbook.name || '',
    cookbook.coverSubtitle || '',
    now
  );
  return result.lastInsertRowid;
}

function updateCookbook(cookbook) {
  getDB().prepare(
    `UPDATE cookbooks SET name = ?, description = ?, coverTitle = ?, coverSubtitle = ?
     WHERE id = ?`
  ).run(
    cookbook.name,
    cookbook.description || '',
    cookbook.coverTitle || cookbook.name || '',
    cookbook.coverSubtitle || '',
    cookbook.id
  );
}

function deleteCookbook(id) {
  if (id === 1) throw new Error('Das Standard-Kochbuch kann nicht gelöscht werden.');
  getDB().prepare('DELETE FROM cookbooks WHERE id = ?').run(id);
}

function getCookbookRecipes(cookbookId) {
  const rows = getDB().prepare(
    `SELECT r.* FROM recipes r
     JOIN recipe_cookbooks rc ON r.id = rc.recipeId
     WHERE rc.cookbookId = ?
     ORDER BY r.title ASC`
  ).all(cookbookId);
  return rows.map(deserializeRecipe);
}

function getRecipeCookbooks(recipeId) {
  return getDB().prepare(
    'SELECT cookbookId FROM recipe_cookbooks WHERE recipeId = ?'
  ).all(recipeId).map(r => r.cookbookId);
}

function getAllRecipeCookbooks() {
  return getDB().prepare('SELECT recipeId, cookbookId FROM recipe_cookbooks').all();
}

function setRecipeCookbooks(recipeId, cookbookIds) {
  const d = getDB();
  const run = d.transaction(() => {
    d.prepare('DELETE FROM recipe_cookbooks WHERE recipeId = ?').run(recipeId);
    for (const cbId of cookbookIds) {
      d.prepare('INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) VALUES (?, ?)').run(recipeId, cbId);
    }
  });
  run();
}

function assignRecipesToCookbook(recipeIds, cookbookId) {
  const d = getDB();
  const stmt = d.prepare('INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) VALUES (?, ?)');
  const run = d.transaction(() => {
    for (const rid of recipeIds) {
      stmt.run(rid, cookbookId);
    }
  });
  run();
}

// --- Settings ---

function getSetting(key) {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); }
  catch { return row.value; }
}

function setSetting(key, value) {
  const serialized = JSON.stringify(value);
  getDB().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, serialized, serialized);
}

// --- Backup ---

function exportAll() {
  const recipes = getAllRecipes();
  const rows = getDB().prepare('SELECT * FROM settings').all();
  const settings = rows.map(r => {
    let value = r.value;
    try { value = JSON.parse(value); } catch {}
    return { key: r.key, value };
  });
  return { recipes, settings };
}

function importAll(data) {
  const d = getDB();
  const run = d.transaction(() => {
    d.prepare('DELETE FROM recipes').run();
    d.prepare('DELETE FROM settings').run();

    for (const recipe of data.recipes) {
      // Handle base64 data-URL blobs from legacy export format
      const r = { ...recipe };
      if (r._pdfBlobType === 'base64' && typeof r.pdfBlob === 'string') {
        // Strip data:...;base64, prefix if present
        const match = r.pdfBlob.match(/^data:[^;]+;base64,(.+)$/);
        r.pdfBlob = match ? match[1] : r.pdfBlob;
        delete r._pdfBlobType;
      }
      if (r._thumbnailBlobType === 'base64' && typeof r.thumbnailBlob === 'string') {
        const match = r.thumbnailBlob.match(/^data:[^;]+;base64,(.+)$/);
        r.thumbnailBlob = match ? match[1] : r.thumbnailBlob;
        delete r._thumbnailBlobType;
      }
      addRecipeRaw(r);
    }

    for (const s of data.settings) {
      setSetting(s.key, s.value);
    }
  });
  run();
}

// Insert recipe preserving original id and timestamps
function addRecipeRaw(recipe) {
  const data = serializeRecipe(recipe);
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(c => data[c]);

  getDB().prepare(
    `INSERT INTO recipes (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...values);
}

// --- Password utilities (server-side) ---

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  // Legacy format (no salt)
  if (!storedHash.includes(':')) {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash === storedHash;
  }

  // New format: salt:hash
  const [salt, hash] = storedHash.split(':');
  const computed = crypto.createHash('sha256').update(salt + password).digest('hex');
  return computed === hash;
}

// --- Users ---

function getAllUsers() {
  return getDB().prepare('SELECT id, username, role, createdAt FROM users ORDER BY createdAt ASC').all();
}

function getUser(id) {
  return getDB().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return getDB().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function addUser(username, password, role = 'user') {
  const result = getDB().prepare(
    'INSERT INTO users (username, passwordHash, role, createdAt) VALUES (?, ?, ?, ?)'
  ).run(username, hashPassword(password), role, new Date().toISOString());
  return result.lastInsertRowid;
}

function updateUserPassword(id, newPassword) {
  getDB().prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(newPassword), id);
}

function updateUserRole(id, role) {
  getDB().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function updateUsername(id, newUsername) {
  const existing = getUserByUsername(newUsername);
  if (existing && existing.id !== id) throw new Error('Benutzername bereits vergeben.');
  getDB().prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, id);
}

function deleteUser(id) {
  // Prevent deleting the last admin
  const user = getUser(id);
  if (user && user.role === 'admin') {
    const adminCount = getDB().prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
    if (adminCount <= 1) throw new Error('Der letzte Admin kann nicht gelöscht werden.');
  }
  getDB().prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  getDB,
  getAllRecipes,
  getRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  getSetting,
  setSetting,
  exportAll,
  importAll,
  hashPassword,
  verifyPassword,
  getAllCookbooks,
  getCookbook,
  addCookbook,
  updateCookbook,
  deleteCookbook,
  getCookbookRecipes,
  getRecipeCookbooks,
  getAllRecipeCookbooks,
  setRecipeCookbooks,
  assignRecipesToCookbook,
  getAllUsers,
  getUser,
  getUserByUsername,
  addUser,
  updateUserPassword,
  updateUserRole,
  updateUsername,
  deleteUser,
};
