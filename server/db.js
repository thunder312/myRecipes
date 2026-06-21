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

    CREATE TABLE IF NOT EXISTS saved_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_recipe_stats (
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipeId INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      cookedDates TEXT NOT NULL DEFAULT '[]',
      cookedCount INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (userId, recipeId)
    );

    CREATE TABLE IF NOT EXISTS week_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      slots TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS week_shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      items TEXT NOT NULL DEFAULT '[]',
      extras TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6b7280',
      createdBy INTEGER,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_product_tags (
      productName TEXT NOT NULL,
      userId INTEGER NOT NULL,
      storeId INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (productName, userId),
      FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipe_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipeId INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      imageBlob BLOB NOT NULL,
      imageMimeType TEXT NOT NULL,
      imageSource TEXT,
      isDefault INTEGER DEFAULT 0,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_images_recipeId ON recipe_images(recipeId);
  `);
}

function createUserCookbook(userId, username) {
  const now = new Date().toISOString();
  const result = getDB().prepare(
    `INSERT INTO cookbooks (name, description, coverTitle, coverSubtitle, createdAt, userId)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    username,
    '',
    `${username}s Rezepte`,
    '',
    now,
    userId
  );
  return result.lastInsertRowid;
}

function migrateSchema() {
  const cols = db.pragma('table_info(recipes)').map(r => r.name);
  if (!cols.includes('sourceNote')) {
    db.exec('ALTER TABLE recipes ADD COLUMN sourceNote TEXT');
  }
  if (!cols.includes('createdBy')) {
    db.exec('ALTER TABLE recipes ADD COLUMN createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!cols.includes('imageBlob')) {
    db.exec('ALTER TABLE recipes ADD COLUMN imageBlob BLOB');
  }
  if (!cols.includes('imageMimeType')) {
    db.exec("ALTER TABLE recipes ADD COLUMN imageMimeType TEXT");
  }
  if (!cols.includes('imageSource')) {
    db.exec("ALTER TABLE recipes ADD COLUMN imageSource TEXT");
  }
  if (!cols.includes('rating')) {
    db.exec('ALTER TABLE recipes ADD COLUMN rating REAL');
  }
  if (!cols.includes('workTime')) {
    db.exec('ALTER TABLE recipes ADD COLUMN workTime INTEGER');
  }
  if (!cols.includes('cookTime')) {
    db.exec('ALTER TABLE recipes ADD COLUMN cookTime INTEGER');
  }
  if (!cols.includes('restTime')) {
    db.exec('ALTER TABLE recipes ADD COLUMN restTime INTEGER');
  }

  // Ensure passwordHash column exists in users table (added in multi-user migration)
  const statsColsCheck = db.pragma('table_info(user_recipe_stats)').map(r => r.name);
  if (!statsColsCheck.includes('favorite')) {
    db.exec('ALTER TABLE user_recipe_stats ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
  }

  const userCols = db.pragma('table_info(users)').map(r => r.name);
  if (!userCols.includes('passwordHash')) {
    db.exec('ALTER TABLE users ADD COLUMN passwordHash TEXT NOT NULL DEFAULT \'\'');
  }
  if (!userCols.includes('language')) {
    db.exec("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'de'");
  }
  if (!userCols.includes('theme')) {
    db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
  }
  if (!userCols.includes('bringEmail')) {
    db.exec('ALTER TABLE users ADD COLUMN bringEmail TEXT');
  }
  if (!userCols.includes('bringPassword')) {
    db.exec('ALTER TABLE users ADD COLUMN bringPassword TEXT');
  }
  if (!userCols.includes('bringListUuid')) {
    db.exec('ALTER TABLE users ADD COLUMN bringListUuid TEXT');
  }
  if (!userCols.includes('bringAccessToken')) {
    db.exec('ALTER TABLE users ADD COLUMN bringAccessToken TEXT');
  }
  if (!userCols.includes('bringUserUuid')) {
    db.exec('ALTER TABLE users ADD COLUMN bringUserUuid TEXT');
  }
  if (!userCols.includes('bringPublicUserUuid')) {
    db.exec('ALTER TABLE users ADD COLUMN bringPublicUserUuid TEXT');
  }
  if (!userCols.includes('lastLoginAt')) {
    db.exec('ALTER TABLE users ADD COLUMN lastLoginAt TEXT');
  }
  if (!userCols.includes('showNewsPopup')) {
    db.exec('ALTER TABLE users ADD COLUMN showNewsPopup INTEGER NOT NULL DEFAULT 1');
  }

  // Add userId to cookbooks (links a cookbook to its owner)
  const cbCols = db.pragma('table_info(cookbooks)').map(r => r.name);
  if (!cbCols.includes('userId')) {
    db.exec('ALTER TABLE cookbooks ADD COLUMN userId INTEGER REFERENCES users(id) ON DELETE CASCADE');
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

  // Migrate store_product_tags: make assignments per-user (productName, userId) composite PK
  const sptCols = db.pragma('table_info(store_product_tags)').map(r => r.name);
  if (!sptCols.includes('userId')) {
    db.exec(`
      DROP TABLE IF EXISTS store_product_tags_old;
      ALTER TABLE store_product_tags RENAME TO store_product_tags_old;
      CREATE TABLE store_product_tags (
        productName TEXT NOT NULL,
        userId INTEGER NOT NULL,
        storeId INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (productName, userId),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO store_product_tags (productName, userId, storeId, updatedAt)
        SELECT productName, updatedBy, storeId, updatedAt
        FROM store_product_tags_old
        WHERE updatedBy IS NOT NULL;
      DROP TABLE store_product_tags_old;
    `);
  }

  // Seed default saved queries if none exist
  const queryCount = getDB().prepare('SELECT COUNT(*) as count FROM saved_queries').get().count;
  if (queryCount === 0) {
    const now = new Date().toISOString();
    const defaults = [
      'Was kann ich schnell kochen?',
      'Heute ist Freitag, bitte kein Fleisch.',
      'Etwas Leichtes, vielleicht einen Salat?',
      'Was passt zu Knödeln?',
      'Ich möchte etwas Neues ausprobieren.',
      'Was habe ich lange nicht mehr gekocht?'
    ];
    const stmt = getDB().prepare('INSERT INTO saved_queries (question, createdAt) VALUES (?, ?)');
    for (const q of defaults) stmt.run(q, now);
  }

  // Remove personal cookbooks from admin users (admins don't need personal cookbooks)
  const adminCookbooks = getDB().prepare(`
    SELECT c.id FROM cookbooks c
    JOIN users u ON c.userId = u.id
    WHERE u.role = 'admin'
  `).all();
  for (const cb of adminCookbooks) {
    getDB().prepare('INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) SELECT recipeId, 1 FROM recipe_cookbooks WHERE cookbookId = ?').run(cb.id);
    getDB().prepare('DELETE FROM cookbooks WHERE id = ?').run(cb.id);
  }

  // Migrate legacy cookedDates/cookedCount from recipes table → user_recipe_stats for the creator
  const recipesWithStats = getDB().prepare(`
    SELECT id, createdBy, cookedDates, cookedCount FROM recipes
    WHERE createdBy IS NOT NULL AND cookedCount > 0
      AND NOT EXISTS (SELECT 1 FROM user_recipe_stats WHERE recipeId = recipes.id AND userId = recipes.createdBy)
  `).all();
  const statsInsert = getDB().prepare(
    'INSERT OR IGNORE INTO user_recipe_stats (userId, recipeId, cookedDates, cookedCount) VALUES (?, ?, ?, ?)'
  );
  for (const r of recipesWithStats) {
    statsInsert.run(r.createdBy, r.id, r.cookedDates || '[]', r.cookedCount || 0);
  }

  // Create personal cookbooks for all users who don't have one yet
  const usersWithoutCookbook = getDB().prepare(`
    SELECT u.id, u.username FROM users u
    WHERE u.role != 'admin' AND NOT EXISTS (SELECT 1 FROM cookbooks WHERE userId = u.id)
  `).all();
  for (const user of usersWithoutCookbook) {
    createUserCookbook(user.id, user.username);
  }

  // Backfill notes that have no username: set username = 'imported', keep existing date or fall back to recipe.createdAt
  const recipesWithNotes = getDB().prepare(`SELECT id, notes, createdAt FROM recipes WHERE notes IS NOT NULL AND notes != '[]'`).all();
  const noteUpdateStmt = getDB().prepare('UPDATE recipes SET notes = ? WHERE id = ?');
  for (const row of recipesWithNotes) {
    let notes;
    try { notes = JSON.parse(row.notes); } catch { continue; }
    if (!Array.isArray(notes)) continue;
    let changed = false;
    notes = notes.map(n => {
      if (n && typeof n === 'object' && !n.username) {
        changed = true;
        return { ...n, username: 'imported', date: n.date || row.createdAt };
      }
      return n;
    });
    if (changed) noteUpdateStmt.run(JSON.stringify(notes), row.id);
  }

  // Migrate existing single images from recipes.imageBlob → recipe_images (isDefault=1)
  const toMigrate = db.prepare(`
    SELECT r.id, r.imageBlob, r.imageMimeType, r.imageSource
    FROM recipes r
    WHERE r.imageBlob IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recipe_images WHERE recipeId = r.id)
  `).all();
  if (toMigrate.length > 0) {
    const now = new Date().toISOString();
    const migInsert = db.prepare(
      'INSERT INTO recipe_images (recipeId, imageBlob, imageMimeType, imageSource, isDefault, sortOrder, createdAt) VALUES (?, ?, ?, ?, 1, 0, ?)'
    );
    for (const r of toMigrate) {
      migInsert.run(r.id, r.imageBlob, r.imageMimeType || 'image/jpeg', r.imageSource || 'user', now);
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
  if (typeof row.imageBlob === 'string' && row.imageBlob.length > 0) {
    row.imageBlob = Buffer.from(row.imageBlob, 'base64');
  } else if (!Buffer.isBuffer(row.imageBlob)) {
    row.imageBlob = null;
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
  if ('imageBlob' in recipe) {
    if (Buffer.isBuffer(recipe.imageBlob)) {
      recipe.imageBlob = recipe.imageBlob.toString('base64');
    } else {
      recipe.imageBlob = null;
    }
  }
  return recipe;
}

// --- Recipe Images ---

function getRecipeImages(recipeId) {
  const rows = getDB().prepare(
    'SELECT id, imageMimeType, imageSource, isDefault, sortOrder, imageBlob FROM recipe_images WHERE recipeId = ? ORDER BY isDefault DESC, sortOrder ASC, id ASC'
  ).all(recipeId);
  return rows.map(r => ({
    id: r.id,
    imageMimeType: r.imageMimeType,
    imageSource: r.imageSource,
    isDefault: r.isDefault === 1,
    sortOrder: r.sortOrder,
    imageBlob: Buffer.isBuffer(r.imageBlob) ? r.imageBlob.toString('base64') : null,
  }));
}

function addRecipeImage(recipeId, blob, mimeType, source, isDefault = false) {
  const imgBuffer = typeof blob === 'string' ? Buffer.from(blob, 'base64') : blob;
  const now = new Date().toISOString();
  const d = getDB();
  let newId;
  d.transaction(() => {
    const count = d.prepare('SELECT COUNT(*) as c FROM recipe_images WHERE recipeId = ?').get(recipeId).c;
    const makeDefault = isDefault || count === 0;
    if (makeDefault) {
      d.prepare('UPDATE recipe_images SET isDefault = 0 WHERE recipeId = ?').run(recipeId);
    }
    const result = d.prepare(
      'INSERT INTO recipe_images (recipeId, imageBlob, imageMimeType, imageSource, isDefault, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(recipeId, imgBuffer, mimeType || 'image/jpeg', source || 'user', makeDefault ? 1 : 0, count, now);
    newId = result.lastInsertRowid;
  })();
  return newId;
}

function setDefaultImage(recipeId, imageId) {
  const d = getDB();
  d.transaction(() => {
    d.prepare('UPDATE recipe_images SET isDefault = 0 WHERE recipeId = ?').run(recipeId);
    d.prepare('UPDATE recipe_images SET isDefault = 1 WHERE id = ? AND recipeId = ?').run(imageId, recipeId);
  })();
}

function removeRecipeImage(recipeId, imageId) {
  const d = getDB();
  d.transaction(() => {
    const img = d.prepare('SELECT isDefault FROM recipe_images WHERE id = ? AND recipeId = ?').get(imageId, recipeId);
    if (!img) return;
    d.prepare('DELETE FROM recipe_images WHERE id = ?').run(imageId);
    if (img.isDefault) {
      const next = d.prepare('SELECT id FROM recipe_images WHERE recipeId = ? ORDER BY sortOrder ASC, id ASC LIMIT 1').get(recipeId);
      if (next) d.prepare('UPDATE recipe_images SET isDefault = 1 WHERE id = ?').run(next.id);
    }
  })();
}

// --- Recipes ---

function mergeUserStats(recipe, userId) {
  if (!recipe || !userId) return recipe;
  const stats = getDB().prepare(
    'SELECT cookedDates, cookedCount, favorite FROM user_recipe_stats WHERE userId = ? AND recipeId = ?'
  ).get(userId, recipe.id);
  if (stats) {
    recipe.cookedDates = JSON.parse(stats.cookedDates || '[]');
    recipe.cookedCount = stats.cookedCount || 0;
    recipe.favorite = stats.favorite ? 1 : 0;
  } else {
    recipe.cookedDates = [];
    recipe.cookedCount = 0;
    recipe.favorite = 0;
  }
  return recipe;
}

function getAllRecipes(userId = null) {
  // Exclude imageBlob from list to keep response small; imageMimeType from default image for badge
  const rows = getDB().prepare(`
    SELECT r.id, r.title, r.category, r.origin, r.prepTime, r.workTime, r.cookTime, r.restTime,
           r.mainIngredient, r.sides, r.tags, r.ingredients, r.description, r.servings, r.difficulty,
           r.recipeText, r.sourceType, r.sourceRef, r.sourceNote, r.createdAt, r.updatedAt,
           r.cookedDates, r.cookedCount, r.notes, r.pdfBlob, r.thumbnailBlob,
           COALESCE(
             (SELECT imageMimeType FROM recipe_images WHERE recipeId = r.id AND isDefault = 1 LIMIT 1),
             r.imageMimeType
           ) AS imageMimeType,
           r.rating, r.createdBy, u.username AS createdByUsername
    FROM recipes r LEFT JOIN users u ON u.id = r.createdBy
    ORDER BY r.createdAt DESC
  `).all();
  const recipes = rows.map(deserializeRecipe);
  if (userId) recipes.forEach(r => mergeUserStats(r, userId));
  return recipes;
}

function getRecipe(id, userId = null) {
  const row = getDB().prepare(`
    SELECT r.*, u.username AS createdByUsername
    FROM recipes r LEFT JOIN users u ON u.id = r.createdBy
    WHERE r.id = ?
  `).get(id);
  const recipe = deserializeRecipe(row);
  if (!recipe) return null;
  const images = getRecipeImages(id);
  recipe.images = images;
  const defaultImg = images.find(img => img.isDefault) || images[0] || null;
  recipe.imageBlob = defaultImg ? defaultImg.imageBlob : null;
  recipe.imageMimeType = defaultImg ? defaultImg.imageMimeType : null;
  recipe.imageSource = defaultImg ? defaultImg.imageSource : null;
  if (userId) mergeUserStats(recipe, userId);
  return recipe;
}

function upsertUserRecipeStats(userId, recipeId, cookedDates, cookedCount) {
  getDB().prepare(`
    INSERT INTO user_recipe_stats (userId, recipeId, cookedDates, cookedCount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userId, recipeId) DO UPDATE SET
      cookedDates = excluded.cookedDates,
      cookedCount = excluded.cookedCount
  `).run(userId, recipeId, JSON.stringify(cookedDates), cookedCount);
}

function setFavorite(userId, recipeId, value) {
  getDB().prepare(`
    INSERT INTO user_recipe_stats (userId, recipeId, cookedDates, cookedCount, favorite)
    VALUES (?, ?, '[]', 0, ?)
    ON CONFLICT(userId, recipeId) DO UPDATE SET favorite = excluded.favorite
  `).run(userId, recipeId, value ? 1 : 0);
}

function addRecipe(recipe, extraCookbookIds = [], userId = null) {
  const now = new Date().toISOString();
  // Extract image data before serialization (stored in separate table)
  const imageBlob = recipe.imageBlob || null;
  const imageMimeType = recipe.imageMimeType || null;
  const imageSource = recipe.imageSource || null;

  const data = serializeRecipe({
    ...recipe,
    imageBlob: null,
    imageMimeType: null,
    imageSource: null,
    createdAt: now,
    updatedAt: now,
    cookedDates: recipe.cookedDates || [],
    cookedCount: recipe.cookedCount || 0,
    notes: recipe.notes || [],
  });
  delete data.id;
  if (userId) data.createdBy = userId;
  delete data.createdByUsername;
  delete data.images;

  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(c => data[c]);

  const d = getDB();
  const result = d.prepare(
    `INSERT INTO recipes (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...values);
  const newId = result.lastInsertRowid;

  if (imageBlob) {
    addRecipeImage(newId, imageBlob, imageMimeType || 'image/jpeg', imageSource || 'user', true);
  }

  const cookbookIds = new Set([1, ...extraCookbookIds]);
  if (userId) {
    const userCookbook = d.prepare('SELECT id FROM cookbooks WHERE userId = ?').get(userId);
    if (userCookbook) cookbookIds.add(userCookbook.id);
  }
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
  delete data.createdByUsername;
  delete data.favorite;
  delete data.images;       // virtual field
  delete data.imageBlob;    // managed via recipe_images
  delete data.imageMimeType;
  delete data.imageSource;

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
  return getDB().prepare(`
    SELECT c.*, COUNT(rc.recipeId) AS recipeCount
    FROM cookbooks c
    LEFT JOIN recipe_cookbooks rc ON rc.cookbookId = c.id
    GROUP BY c.id
    ORDER BY c.id ASC
  `).all();
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

function clearCookbook(cookbookId) {
  const d = getDB();
  d.transaction(() => {
    if (cookbookId === 1) {
      // Rezepte mit bekanntem Ersteller in deren persönliches Kochbuch verschieben
      const recipes = d.prepare(`
        SELECT r.id, r.createdBy FROM recipes r
        JOIN recipe_cookbooks rc ON r.id = rc.recipeId
        WHERE rc.cookbookId = 1 AND r.createdBy IS NOT NULL
      `).all();
      const insertStmt = d.prepare('INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) VALUES (?, ?)');
      for (const recipe of recipes) {
        const userCookbook = d.prepare('SELECT id FROM cookbooks WHERE userId = ?').get(recipe.createdBy);
        if (userCookbook) insertStmt.run(recipe.id, userCookbook.id);
      }
    }
    d.prepare('DELETE FROM recipe_cookbooks WHERE cookbookId = ?').run(cookbookId);
  })();
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
    `SELECT c.id, c.name FROM cookbooks c
     JOIN recipe_cookbooks rc ON c.id = rc.cookbookId
     WHERE rc.recipeId = ?
     ORDER BY c.id ASC`
  ).all(recipeId);
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

function exportAll(includeImages = false) {
  const rows = getDB().prepare(`
    SELECT r.*, u.username AS createdByUsername
    FROM recipes r LEFT JOIN users u ON u.id = r.createdBy
    ORDER BY r.createdAt DESC
  `).all();
  const recipes = rows.map(row => {
    const recipe = deserializeRecipe(row);
    const images = getRecipeImages(recipe.id);
    recipe.images = includeImages
      ? images
      : images.map(({ imageBlob: _b, ...rest }) => rest);
    recipe.imageBlob = null;
    recipe.imageMimeType = null;
    recipe.imageSource = null;
    return recipe;
  });
  const settingRows = getDB().prepare('SELECT * FROM settings').all();
  const settings = settingRows.map(r => {
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
    d.prepare('DELETE FROM recipe_images').run();
    d.prepare('DELETE FROM settings').run();

    for (const recipe of data.recipes) {
      const r = { ...recipe };
      if (r._pdfBlobType === 'base64' && typeof r.pdfBlob === 'string') {
        const match = r.pdfBlob.match(/^data:[^;]+;base64,(.+)$/);
        r.pdfBlob = match ? match[1] : r.pdfBlob;
        delete r._pdfBlobType;
      }
      if (r._thumbnailBlobType === 'base64' && typeof r.thumbnailBlob === 'string') {
        const match = r.thumbnailBlob.match(/^data:[^;]+;base64,(.+)$/);
        r.thumbnailBlob = match ? match[1] : r.thumbnailBlob;
        delete r._thumbnailBlobType;
      }
      // Capture legacy single image before stripping
      if (typeof r.imageBlob === 'string' && r.imageBlob.startsWith('data:')) {
        const match = r.imageBlob.match(/^data:[^;]+;base64,(.+)$/);
        r.imageBlob = match ? match[1] : null;
      }
      const legacyBlob = r.imageBlob || null;
      const legacyMime = r.imageMimeType || null;
      const legacySrc = r.imageSource || null;
      const importedImages = Array.isArray(r.images) ? r.images : null;

      r.imageBlob = null;
      r.imageMimeType = null;
      r.imageSource = null;
      delete r.images;

      const recipeId = addRecipeRaw(r);
      const now = new Date().toISOString();

      if (importedImages && importedImages.length > 0) {
        const insertImg = d.prepare(
          'INSERT INTO recipe_images (recipeId, imageBlob, imageMimeType, imageSource, isDefault, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const img of importedImages) {
          if (!img.imageBlob) continue;
          const blob = typeof img.imageBlob === 'string' ? Buffer.from(img.imageBlob, 'base64') : img.imageBlob;
          insertImg.run(recipeId, blob, img.imageMimeType || 'image/jpeg', img.imageSource || 'user', img.isDefault ? 1 : 0, img.sortOrder || 0, img.createdAt || now);
        }
      } else if (legacyBlob) {
        const blob = Buffer.from(legacyBlob, 'base64');
        d.prepare(
          'INSERT INTO recipe_images (recipeId, imageBlob, imageMimeType, imageSource, isDefault, sortOrder, createdAt) VALUES (?, ?, ?, ?, 1, 0, ?)'
        ).run(recipeId, blob, legacyMime || 'image/jpeg', legacySrc || 'user', now);
      }
    }

    for (const s of data.settings) {
      setSetting(s.key, s.value);
    }
  });
  run();
}

// Insert recipe preserving original id and timestamps; returns the inserted id
function addRecipeRaw(recipe) {
  const data = serializeRecipe({ ...recipe });
  delete data.images;
  delete data.imageBlob;
  delete data.imageMimeType;
  delete data.imageSource;
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(c => data[c]);

  const result = getDB().prepare(
    `INSERT INTO recipes (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...values);
  return recipe.id || result.lastInsertRowid;
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
  const userId = result.lastInsertRowid;
  if (role !== 'admin') createUserCookbook(userId, username);
  return userId;
}

function updateUserPassword(id, newPassword) {
  getDB().prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(newPassword), id);
}

function updateUserRole(id, role) {
  getDB().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function getUserLanguage(id) {
  const row = getDB().prepare('SELECT language FROM users WHERE id = ?').get(id);
  return row ? (row.language || 'de') : 'de';
}

function setUserLanguage(id, lang) {
  getDB().prepare('UPDATE users SET language = ? WHERE id = ?').run(lang, id);
}

function getUserTheme(id) {
  const row = getDB().prepare('SELECT theme FROM users WHERE id = ?').get(id);
  return row ? (row.theme || 'light') : 'light';
}

function setUserTheme(id, theme) {
  getDB().prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, id);
}

function getUserLastLogin(id) {
  const row = getDB().prepare('SELECT lastLoginAt, showNewsPopup FROM users WHERE id = ?').get(id);
  return row ? { lastLoginAt: row.lastLoginAt || null, showNewsPopup: row.showNewsPopup !== 0 } : null;
}

function updateUserLastLogin(id, timestamp) {
  getDB().prepare('UPDATE users SET lastLoginAt = ? WHERE id = ?').run(timestamp, id);
}

function setUserShowNewsPopup(id, value) {
  getDB().prepare('UPDATE users SET showNewsPopup = ? WHERE id = ?').run(value ? 1 : 0, id);
}

function getNewRecipesSince(since) {
  const rows = getDB().prepare(
    'SELECT id, title, createdAt FROM recipes WHERE createdAt > ? ORDER BY createdAt DESC'
  ).all(since);
  return rows;
}

function getUserBringConfig(id) {
  const row = getDB().prepare('SELECT bringEmail, bringPassword, bringListUuid, bringAccessToken, bringUserUuid, bringPublicUserUuid FROM users WHERE id = ?').get(id);
  if (!row) return null;
  return {
    email: row.bringEmail || null,
    password: row.bringPassword || null,
    listUuid: row.bringListUuid || null,
    accessToken: row.bringAccessToken || null,
    userUuid: row.bringUserUuid || null,
    publicUserUuid: row.bringPublicUserUuid || null,
  };
}

function setUserBringConfig(id, { email, password, listUuid, accessToken, userUuid, publicUserUuid }) {
  getDB().prepare('UPDATE users SET bringEmail = ?, bringPassword = ?, bringListUuid = ?, bringAccessToken = ?, bringUserUuid = ?, bringPublicUserUuid = ? WHERE id = ?')
    .run(email || null, password || null, listUuid || null, accessToken || null, userUuid || null, publicUserUuid || null, id);
}

function updateUserBringToken(id, accessToken, userUuid, publicUserUuid) {
  getDB().prepare('UPDATE users SET bringAccessToken = ?, bringUserUuid = ?, bringPublicUserUuid = ? WHERE id = ?')
    .run(accessToken, userUuid, publicUserUuid || null, id);
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
  const d = getDB();
  // Before deleting personal cookbook: ensure all its recipes remain in the default cookbook
  const personalCookbook = d.prepare('SELECT id FROM cookbooks WHERE userId = ?').get(id);
  if (personalCookbook) {
    d.prepare(
      'INSERT OR IGNORE INTO recipe_cookbooks (recipeId, cookbookId) SELECT recipeId, 1 FROM recipe_cookbooks WHERE cookbookId = ?'
    ).run(personalCookbook.id);
    d.prepare('DELETE FROM cookbooks WHERE id = ?').run(personalCookbook.id);
  }
  d.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// --- Week Plan ---

function getWeekPlan(userId) {
  const row = getDB().prepare('SELECT * FROM week_plan WHERE userId = ?').get(userId);
  if (!row) return { slots: [] };
  return { ...row, slots: JSON.parse(row.slots || '[]') };
}

function saveWeekPlan(userId, slots) {
  const now = new Date().toISOString();
  getDB().prepare(`
    INSERT INTO week_plan (userId, slots, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET slots = excluded.slots, updatedAt = excluded.updatedAt
  `).run(userId, JSON.stringify(slots), now);
}

function getWeekShoppingList(userId) {
  const row = getDB().prepare('SELECT * FROM week_shopping_list WHERE userId = ?').get(userId);
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items || '[]'), extras: JSON.parse(row.extras || '[]') };
}

function saveWeekShoppingList(userId, items, extras) {
  const now = new Date().toISOString();
  getDB().prepare(`
    INSERT INTO week_shopping_list (userId, items, extras, updatedAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET items = excluded.items, extras = excluded.extras, updatedAt = excluded.updatedAt
  `).run(userId, JSON.stringify(items), JSON.stringify(extras || []), now);
}

function deleteWeekShoppingList(userId) {
  getDB().prepare('DELETE FROM week_shopping_list WHERE userId = ?').run(userId);
}

// --- Stores ---

function getAllStores() {
  return getDB().prepare('SELECT * FROM stores ORDER BY name ASC').all();
}

function addStore(name, color, userId) {
  const result = getDB().prepare(
    'INSERT INTO stores (name, color, createdBy, createdAt) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), color || '#6b7280', userId, new Date().toISOString());
  return result.lastInsertRowid;
}

function deleteStore(id) {
  getDB().prepare('DELETE FROM stores WHERE id = ?').run(id);
}

function getProductTags(userId) {
  return getDB().prepare('SELECT * FROM store_product_tags WHERE userId = ? ORDER BY productName ASC').all(userId);
}

function setProductTag(productName, storeId, userId) {
  const now = new Date().toISOString();
  getDB().prepare(`
    INSERT INTO store_product_tags (productName, userId, storeId, updatedAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(productName, userId) DO UPDATE SET storeId = excluded.storeId, updatedAt = excluded.updatedAt
  `).run(productName.toLowerCase().trim(), userId, storeId, now);
}

function deleteProductTag(productName, userId) {
  getDB().prepare('DELETE FROM store_product_tags WHERE productName = ? AND userId = ?').run(productName.toLowerCase().trim(), userId);
}

// --- Saved Queries ---

function getAllSavedQueries() {
  return getDB().prepare('SELECT * FROM saved_queries ORDER BY createdAt ASC').all();
}

function addSavedQuery(question) {
  const result = getDB().prepare(
    'INSERT INTO saved_queries (question, createdAt) VALUES (?, ?)'
  ).run(question.trim(), new Date().toISOString());
  return result.lastInsertRowid;
}

function deleteSavedQuery(id) {
  getDB().prepare('DELETE FROM saved_queries WHERE id = ?').run(id);
}

module.exports = {
  getDB,
  getAllRecipes,
  getRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipeImages,
  addRecipeImage,
  setDefaultImage,
  removeRecipeImage,
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
  clearCookbook,
  getAllUsers,
  getUser,
  getUserByUsername,
  addUser,
  updateUserPassword,
  updateUserRole,
  updateUsername,
  deleteUser,
  getUserLanguage,
  setUserLanguage,
  getUserTheme,
  setUserTheme,
  getAllSavedQueries,
  addSavedQuery,
  deleteSavedQuery,
  upsertUserRecipeStats,
  setFavorite,
  getWeekPlan,
  saveWeekPlan,
  getWeekShoppingList,
  saveWeekShoppingList,
  deleteWeekShoppingList,
  getAllStores,
  addStore,
  deleteStore,
  getProductTags,
  setProductTag,
  deleteProductTag,
  getUserBringConfig,
  setUserBringConfig,
  updateUserBringToken,
  getUserLastLogin,
  updateUserLastLogin,
  setUserShowNewsPopup,
  getNewRecipesSince,
};
