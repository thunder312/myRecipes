// REST API wrapper – replaces the former IndexedDB layer.
// All functions keep the same signature so no other module needs changes.

import { getAuthToken, touchActivity } from './utils/auth.js';

const API = '/api';

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  // Attach auth token if available
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(API + path, { ...options, headers });

  // Keep the client-side session alive on every authenticated API call
  if (token && res.ok) {
    touchActivity();
  }

  if (res.status === 401) {
    throw new Error('Nicht authentifiziert – bitte zuerst anmelden.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API-Fehler: ${res.status}`);
  }

  return res;
}

// --- Blob helpers ---

function base64ToBlob(base64, type) {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Strip the data:...;base64, prefix – server expects raw base64
      const result = reader.result;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function hydrateBlobs(recipe) {
  if (!recipe) return recipe;
  recipe.pdfBlob = null;
  if (typeof recipe.thumbnailBlob === 'string' && recipe.thumbnailBlob) {
    recipe.thumbnailBlob = base64ToBlob(recipe.thumbnailBlob, 'image/png');
  } else {
    recipe.thumbnailBlob = null;
  }
  return recipe;
}

async function dehydrateBlobs(recipe) {
  const copy = { ...recipe };
  delete copy.pdfBlob;
  if (copy.thumbnailBlob instanceof Blob) {
    copy.thumbnailBlob = await blobToBase64(copy.thumbnailBlob);
  }
  return copy;
}

// --- Recipes ---

export async function getAllRecipes() {
  const res = await apiFetch('/recipes');
  const recipes = await res.json();
  return recipes.map(hydrateBlobs);
}

export async function getRecipe(id) {
  const res = await apiFetch(`/recipes/${id}`);
  return hydrateBlobs(await res.json());
}

export async function addRecipe(recipe) {
  const body = await dehydrateBlobs(recipe);
  const res = await apiFetch('/recipes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const { id } = await res.json();
  return id;
}

export async function updateRecipe(recipe) {
  const body = await dehydrateBlobs(recipe);
  await apiFetch(`/recipes/${recipe.id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteRecipe(id) {
  await apiFetch(`/recipes/${id}`, { method: 'DELETE' });
}

// --- Settings ---

export async function getSetting(key) {
  try {
    const res = await apiFetch(`/settings/${encodeURIComponent(key)}`);
    const { value } = await res.json();
    return value;
  } catch {
    return null;
  }
}

export async function setSetting(key, value) {
  await apiFetch(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

// --- Backup ---

export async function exportAll() {
  const res = await apiFetch('/backup/export');
  return res.json();
}

export async function importAll(data) {
  await apiFetch('/backup/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
