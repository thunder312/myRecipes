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

export async function addRecipe(recipe, extraCookbookIds = []) {
  const body = await dehydrateBlobs(recipe);
  if (extraCookbookIds.length > 0) {
    body._cookbookIds = extraCookbookIds;
  }
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

export async function patchRecipe(id, data) {
  await apiFetch(`/recipes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteRecipe(id) {
  await apiFetch(`/recipes/${id}`, { method: 'DELETE' });
}

// --- Cookbooks ---

export async function getAllCookbooks() {
  const res = await apiFetch('/cookbooks');
  return res.json();
}

export async function addCookbook(cookbook) {
  const res = await apiFetch('/cookbooks', {
    method: 'POST',
    body: JSON.stringify(cookbook),
  });
  const { id } = await res.json();
  return id;
}

export async function updateCookbook(cookbook) {
  await apiFetch(`/cookbooks/${cookbook.id}`, {
    method: 'PUT',
    body: JSON.stringify(cookbook),
  });
}

export async function deleteCookbook(id) {
  await apiFetch(`/cookbooks/${id}`, { method: 'DELETE' });
}

export async function getCookbookRecipes(cookbookId) {
  const res = await apiFetch(`/cookbooks/${cookbookId}/recipes`);
  const recipes = await res.json();
  return recipes.map(hydrateBlobs);
}

export async function assignRecipesToCookbook(recipeIds, cookbookId) {
  await apiFetch(`/cookbooks/${cookbookId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ recipeIds }),
  });
}

export async function getRecipeCookbooks(recipeId) {
  const res = await apiFetch(`/cookbooks/recipe/${recipeId}`);
  return res.json();
}

export async function getCookbookMemberships() {
  const res = await apiFetch('/cookbooks/memberships');
  return res.json(); // [{recipeId, cookbookId}, ...]
}

export async function setRecipeCookbooks(recipeId, cookbookIds) {
  await apiFetch(`/cookbooks/recipe/${recipeId}`, {
    method: 'PUT',
    body: JSON.stringify({ cookbookIds }),
  });
}

// --- Users ---

export async function getAllUsers() {
  const res = await apiFetch('/users');
  return res.json();
}

export async function createUser(username, password, role) {
  const res = await apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });
  return res.json();
}

export async function resetUserPassword(id, newPassword) {
  await apiFetch(`/users/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword }),
  });
}

export async function changeUserRole(id, role) {
  await apiFetch(`/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function deleteUser(id) {
  await apiFetch(`/users/${id}`, { method: 'DELETE' });
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
