import { openDB } from 'idb';

const DB_NAME = 'myRecipesDB';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recipes')) {
          const store = db.createObjectStore('recipes', { keyPath: 'id', autoIncrement: true });
          store.createIndex('category', 'category');
          store.createIndex('origin', 'origin');
          store.createIndex('mainIngredient', 'mainIngredient');
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
    });
  }
  return dbPromise;
}

// --- Recipes ---

export async function getAllRecipes() {
  const db = await getDB();
  return db.getAll('recipes');
}

export async function getRecipe(id) {
  const db = await getDB();
  return db.get('recipes', id);
}

export async function addRecipe(recipe) {
  const db = await getDB();
  const now = new Date().toISOString();
  recipe.createdAt = now;
  recipe.updatedAt = now;
  recipe.cookedDates = recipe.cookedDates || [];
  recipe.cookedCount = recipe.cookedCount || 0;
  return db.add('recipes', recipe);
}

export async function updateRecipe(recipe) {
  const db = await getDB();
  recipe.updatedAt = new Date().toISOString();
  return db.put('recipes', recipe);
}

export async function deleteRecipe(id) {
  const db = await getDB();
  return db.delete('recipes', id);
}

// --- Settings ---

export async function getSetting(key) {
  const db = await getDB();
  const entry = await db.get('settings', key);
  return entry ? entry.value : null;
}

export async function setSetting(key, value) {
  const db = await getDB();
  return db.put('settings', { key, value });
}

// --- Backup ---

export async function exportAll() {
  const db = await getDB();
  const recipes = await db.getAll('recipes');
  const settings = await db.getAll('settings');

  // Convert Blobs to base64 for JSON export
  const recipesExport = await Promise.all(recipes.map(async (r) => {
    const copy = { ...r };
    if (copy.pdfBlob instanceof Blob) {
      copy.pdfBlob = await blobToBase64(copy.pdfBlob);
      copy._pdfBlobType = 'base64';
    }
    if (copy.thumbnailBlob instanceof Blob) {
      copy.thumbnailBlob = await blobToBase64(copy.thumbnailBlob);
      copy._thumbnailBlobType = 'base64';
    }
    return copy;
  }));

  return { recipes: recipesExport, settings };
}

export async function importAll(data) {
  const db = await getDB();
  const tx = db.transaction(['recipes', 'settings'], 'readwrite');

  // Clear existing data
  await tx.objectStore('recipes').clear();
  await tx.objectStore('settings').clear();

  // Import recipes
  for (const r of data.recipes) {
    if (r._pdfBlobType === 'base64' && typeof r.pdfBlob === 'string') {
      r.pdfBlob = base64ToBlob(r.pdfBlob, 'application/pdf');
      delete r._pdfBlobType;
    }
    if (r._thumbnailBlobType === 'base64' && typeof r.thumbnailBlob === 'string') {
      r.thumbnailBlob = base64ToBlob(r.thumbnailBlob, 'image/png');
      delete r._thumbnailBlobType;
    }
    await tx.objectStore('recipes').add(r);
  }

  // Import settings
  for (const s of data.settings) {
    await tx.objectStore('settings').put(s);
  }

  await tx.done;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl, type) {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type });
}
