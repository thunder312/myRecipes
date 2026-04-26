import { getRecipe, addRecipe, updateRecipe, patchRecipe, deleteRecipe, uploadRecipeImage, deleteRecipeImage, setFavorite } from '../db.js';
import { generateRecipePDF, generateRecipeA5PDF } from '../pdf-generator.js';
import { $, createElement, formatDate, formatDateTime, todayISO, showToast, categoryChipClass } from '../utils/helpers.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';
import { isAuthenticated, getAuthUser } from '../utils/auth.js';
import { t, translateCategory, translateDifficulty } from '../i18n.js';
import { openShoppingListModal } from '../shopping-list.js';
import { openCookingMode } from '../cooking-mode.js';
import { scaleIngredient } from '../utils/ingredient-scaler.js';

export async function render(container, recipeId) {
  const id = parseInt(recipeId, 10);
  const recipe = await getRecipe(id);

  if (!recipe) {
    container.innerHTML = `<div class="error-state"><h2>${t('detail.notFound')}</h2><a href="#overview" class="btn">${t('detail.backToOverview')}</a></div>`;
    return;
  }

  // Ensure notes array exists (migration for older recipes)
  if (!Array.isArray(recipe.notes)) {
    recipe.notes = [];
  }

  renderDetailView(container, recipe);
}

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

function openPdfInTab(url, filename) {
  if (isMobileDevice()) {
    // Mobile: Download auslösen → öffnet im nativen PDF-Viewer des Geräts
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // Desktop: embed-Trick für sprechenden Tab-Titel
    const title = filename.replace(/\.pdf$/i, '');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>*{margin:0;padding:0}html,body,embed{width:100%;height:100%;border:0;display:block}</style></head>` +
      `<body><embed src="${url}" type="application/pdf"></body></html>`
    );
    win.document.close();
  }
}

function splitIntoSteps(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  // Kein Zeilenumbruch: am ". " vor Großbuchstaben oder am "; " trennen
  const parts = text.split(/;\s+|\.\s+(?=[A-ZÜÄÖA-Z])/);
  const result = parts.map(s => s.trim()).filter(Boolean);
  return result.length > 1 ? result : lines;
}

// Erkennt Unter-Überschriften: kurze Zeile ohne Satzzeichen, endet mit ":"
function isStepHeading(s) {
  return /^[^.!?]{1,60}:\s*$/.test(s);
}

function renderRecipeSteps(text) {
  const steps = splitIntoSteps(text);
  const alreadyNumbered = steps.length > 1 && /^\d+[.)]\s/.test(steps[0]);

  let html = '';
  let inList = false;

  for (const s of steps) {
    if (isStepHeading(s)) {
      if (inList) { html += '</ol>'; inList = false; }
      html += `<h4 class="recipe-steps__heading">${esc(s.replace(/:\s*$/, '').trimEnd())}</h4>`;
    } else {
      if (!inList) { html += '<ol class="recipe-steps">'; inList = true; }
      const text = alreadyNumbered ? s.replace(/^\d+[.)]\s*/, '') : s;
      html += `<li>${esc(text)}</li>`;
    }
  }
  if (inList) html += '</ol>';
  return html;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDetailView(container, recipe) {
  const user = getAuthUser();
  const loggedIn = isAuthenticated();
  const canEdit = loggedIn && (
    user.role === 'admin' ||
    !recipe.createdBy ||
    user.username === recipe.createdByUsername
  );

  const displayCat = translateCategory(recipe.category);
  const displayDiff = translateDifficulty(recipe.difficulty);

  container.innerHTML = `
    <div class="detail">
      <div class="detail__header">
        <a href="#overview" class="btn btn--ghost">${t('detail.back')}</a>
        <div class="detail__actions">
          ${canEdit ? `<button class="btn btn--secondary" id="btnEdit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> ${t('detail.editBtn')}</button>` : ''}
          ${loggedIn ? `<button class="btn btn--ghost" id="btnDuplicate"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> ${t('detail.duplicateBtn')}</button>` : ''}
          <button class="btn btn--primary" id="btnCooked">${t('detail.cookedToday')}</button>
          ${canEdit ? `<button class="btn btn--danger" id="btnDelete">${t('detail.deleteBtn')}</button>` : ''}
        </div>
      </div>

      ${recipe.imageBlob ? `
      <div class="detail__image">
        <img src="data:${recipe.imageMimeType || 'image/jpeg'};base64,${recipe.imageBlob}" alt="${esc(recipe.title)}" class="detail__image-img" loading="lazy" />
        ${canEdit ? `<div class="detail__image-actions">
          <label class="btn btn--ghost btn--sm detail__image-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            ${t('detail.imageChange')}
            <input type="file" id="imageFileInput" accept="image/*" class="hidden" />
          </label>
          <button class="btn btn--ghost btn--sm detail__image-btn" id="btnDeleteImage">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            ${t('detail.imageDelete')}
          </button>
        </div>` : ''}
      </div>` : `
      ${canEdit ? `<div class="detail__image detail__image--empty">
        <label class="btn btn--ghost detail__image-upload-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          ${t('detail.imageUpload')}
          <input type="file" id="imageFileInput" accept="image/*" class="hidden" />
        </label>
      </div>` : ''}`}

      <div class="detail__title-row">
        <h1 class="detail__title">${esc(recipe.title)}</h1>
        <div class="detail__title-actions">
          <div class="detail__rating" id="ratingWidget" title="Bewertung ändern">
            <img src="img/rating/${recipe.rating || 0}.webp" alt="Bewertung ${recipe.rating || 0}" class="detail__rating-img" id="ratingImg" />
          </div>
          ${canEdit ? `<button class="detail__favorite${recipe.favorite ? ' detail__favorite--active' : ''}" id="favoriteBtn" type="button">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="${recipe.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>` : ''}
        </div>
      </div>

      <div class="detail__meta">
        ${recipe.category ? `<span class="chip ${categoryChipClass(recipe.category)}">${esc(displayCat)}</span>` : ''}
        ${recipe.origin ? `<span class="chip chip--origin">${esc(recipe.origin)}</span>` : ''}
        ${recipe.prepTime ? `<span class="chip chip--time">${t('detail.minutes', recipe.prepTime)}</span>` : ''}
        ${recipe.difficulty ? `<span class="chip chip--difficulty">${esc(displayDiff)}</span>` : ''}
        ${recipe.mainIngredient ? `<span class="chip chip--ingredient">${esc(recipe.mainIngredient)}</span>` : ''}
      </div>

      <div class="detail__scaler">
        <button class="scaler__btn" id="scalerMinus" aria-label="Portionen verringern">−</button>
        <span class="scaler__label" id="scalerLabel">${t('detail.servingsScaled', recipe.servings || 1)}</span>
        <button class="scaler__btn" id="scalerPlus" aria-label="Portionen erhöhen">+</button>
      </div>

      ${recipe.description ? `<p class="detail__desc">${esc(recipe.description)}</p>` : ''}

      ${recipe.tags?.length ? `
        <div class="detail__tags">
          <strong>${t('detail.tags')}:</strong> ${recipe.tags.map(tag => `<span class="chip chip--tag">${esc(tag)}</span>`).join(' ')}
        </div>
      ` : ''}

      ${recipe.sides?.length ? `
        <div class="detail__sides">
          <strong>${t('detail.sides')}:</strong> ${recipe.sides.map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}
        </div>
      ` : ''}

      ${recipe.ingredients?.length ? `
        <div class="detail__ingredients">
          <h3>${t('detail.ingredients')}</h3>
          <ul id="ingredientList">${recipe.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      <div class="detail__recipe-text">
        <h3>${t('detail.preparation')}</h3>
        ${recipe.recipeText
          ? renderRecipeSteps(recipe.recipeText)
          : `<p class="recipe-text recipe-text--empty">${t('detail.noSteps')}</p>`
        }
      </div>

      <div class="detail__pdf">
        <h3>${t('detail.pdfSection')}</h3>
        ${recipe.imageBlob ? `
        <label class="settings__checkbox-label" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="pdfIncludeImage" />
          ${t('detail.pdfIncludeImage')}
        </label>` : ''}
        <div class="pdf-actions">
          <a id="pdfDownload" class="btn btn--secondary">${t('detail.pdfA4Download')}</a>
          <button id="pdfOpen" class="btn btn--primary">${t('detail.pdfA4Open')}</button>
          <a id="pdfA5Download" class="btn btn--secondary">${t('detail.pdfA5Download')}</a>
          <button id="pdfA5Open" class="btn btn--primary">${t('detail.pdfA5Open')}</button>
        </div>
      </div>

      <div class="detail__shopping">
        <button class="btn btn--secondary" id="btnShoppingList">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          ${t('detail.shoppingListBtn')}
        </button>
        ${splitIntoSteps(recipe.recipeText || '').length > 0 ? `
        <button class="btn btn--primary" id="btnCookMode">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
          ${t('detail.cookModeBtn')}
        </button>` : ''}
      </div>

      <!-- Notes Section -->
      <div class="detail__notes">
        <h3>${t('detail.notesSection')}</h3>
        <p class="detail__notes-hint">${t('detail.noteHint')}</p>
        <div class="notes-list" id="notesList">
          ${recipe.notes.length === 0
            ? `<p class="notes-list__empty">${t('detail.noNotes')}</p>`
            : recipe.notes.map((note, idx) => {
                const canDeleteNote = loggedIn && (
                  user.role === 'admin' ||
                  !note.username ||
                  note.username === user.username
                );
                return `
              <div class="note-card" data-index="${idx}">
                <div class="note-card__header">
                  ${note.username ? `<span class="note-card__author">${esc(note.username)}</span>` : ''}
                  <span class="note-card__date">${formatDateTime(note.date)}</span>
                  ${canDeleteNote ? `<button class="note-card__delete" data-delete-note="${idx}" title="${t('detail.noteDeleteTitle')}">&times;</button>` : ''}
                </div>
                <div class="note-card__text">${esc(note.text)}</div>
              </div>`;
              }).join('')}
        </div>
        ${loggedIn ? `<div class="notes-add">
          <textarea id="newNoteText" class="input input--textarea" rows="3" placeholder="${t('detail.notePlaceholder')}"></textarea>
          <button class="btn btn--secondary" id="btnAddNote">${t('detail.addNoteBtn')}</button>
        </div>` : ''}
      </div>

      <div class="detail__stats">
        <h3>${t('detail.statsSection')}</h3>
        <div class="stat-grid">
          <div class="stat">
            <span class="stat__value" id="cookedCount">${recipe.cookedCount || 0}</span>
            <span class="stat__label">${t('detail.timesCooked')}</span>
          </div>
          <div class="stat">
            <span class="stat__value">${recipe.cookedDates?.length ? formatDate(recipe.cookedDates[recipe.cookedDates.length - 1]) : '–'}</span>
            <span class="stat__label">${t('detail.lastCooked')}</span>
          </div>
          <div class="stat">
            <span class="stat__value">${formatDate(recipe.createdAt)}</span>
            <span class="stat__label">${t('detail.importedOn')}</span>
          </div>
        </div>
        ${recipe.cookedDates?.length ? `
          <details class="detail__history">
            <summary>${t('detail.cookingHistory', recipe.cookedDates.length)}</summary>
            <ul>${[...recipe.cookedDates].reverse().map(d => `<li>${formatDate(d)}</li>`).join('')}</ul>
          </details>
        ` : ''}
      </div>

      <div class="detail__source">
        <small>${t('detail.source')}: ${esc(recipe.sourceType)} – ${esc(recipe.sourceRef) || '–'}</small>
      </div>
    </div>
  `;

  // PDF on demand – cache invalidated when "include image" checkbox changes
  let pdfUrl = null;
  let pdfA5Url = null;
  let lastIncludeImage = false;

  function getIncludeImage() {
    return !!$('#pdfIncludeImage', container)?.checked;
  }

  function invalidatePdfCache() {
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; }
    if (pdfA5Url) { URL.revokeObjectURL(pdfA5Url); pdfA5Url = null; }
  }

  const pdfCheckbox = $('#pdfIncludeImage', container);
  if (pdfCheckbox) {
    pdfCheckbox.addEventListener('change', invalidatePdfCache);
  }

  function getPdfUrl() {
    const inc = getIncludeImage();
    if (!pdfUrl || inc !== lastIncludeImage) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      lastIncludeImage = inc;
      const blob = generateRecipePDF(recipe, { includeImage: inc });
      pdfUrl = URL.createObjectURL(blob);
    }
    return pdfUrl;
  }

  function getPdfA5Url() {
    const inc = getIncludeImage();
    if (!pdfA5Url || inc !== lastIncludeImage) {
      if (pdfA5Url) URL.revokeObjectURL(pdfA5Url);
      lastIncludeImage = inc;
      const blob = generateRecipeA5PDF(recipe, { includeImage: inc });
      pdfA5Url = URL.createObjectURL(blob);
    }
    return pdfA5Url;
  }

  const filename = `${recipe.title || 'rezept'}.pdf`;
  const filenameA5 = `${recipe.title || 'rezept'}-A5.pdf`;

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  $('#pdfDownload', container).addEventListener('click', (e) => {
    e.preventDefault();
    triggerDownload(getPdfUrl(), filename);
  });
  $('#pdfOpen', container).addEventListener('click', () => openPdfInTab(getPdfUrl(), filename));

  $('#pdfA5Download', container).addEventListener('click', (e) => {
    e.preventDefault();
    triggerDownload(getPdfA5Url(), filenameA5);
  });
  $('#pdfA5Open', container).addEventListener('click', () => openPdfInTab(getPdfA5Url(), filenameA5));

  // --- Portions scaler ---
  let currentServings = recipe.servings || 1;
  const baseServings  = recipe.servings || 1;

  function getScaledIngredients() {
    const factor = currentServings / baseServings;
    return (recipe.ingredients || []).map(i => scaleIngredient(i, factor));
  }

  function updateScaler() {
    const labelEl = $('#scalerLabel', container);
    const listEl  = $('#ingredientList', container);
    if (labelEl) labelEl.textContent = t('detail.servingsScaled', currentServings);
    if (listEl) {
      const factor = currentServings / baseServings;
      listEl.innerHTML = (recipe.ingredients || [])
        .map(i => `<li>${esc(scaleIngredient(i, factor))}</li>`)
        .join('');
    }
  }

  $('#scalerMinus', container).addEventListener('click', () => {
    if (currentServings > 1) { currentServings--; updateScaler(); }
  });
  $('#scalerPlus', container).addEventListener('click', () => {
    if (currentServings < 99) { currentServings++; updateScaler(); }
  });

  // Favorite toggle
  $('#favoriteBtn', container)?.addEventListener('click', async () => {
    const newVal = recipe.favorite ? 0 : 1;
    recipe.favorite = newVal;
    const btn = $('#favoriteBtn', container);
    btn.classList.toggle('detail__favorite--active', !!newVal);
    btn.querySelector('svg').setAttribute('fill', newVal ? 'currentColor' : 'none');
    try {
      await setFavorite(recipe.id, newVal);
    } catch {
      recipe.favorite = newVal ? 0 : 1;
      btn.classList.toggle('detail__favorite--active', !newVal);
      btn.querySelector('svg').setAttribute('fill', newVal ? 'none' : 'currentColor');
      showToast(t('common.error'), 'error');
    }
  });

  // Rating widget – cycles 0→1→2→3→4→5→0 on click
  $('#ratingWidget', container).addEventListener('click', async () => {
    const prev = recipe.rating || 0;
    const next = prev >= 5 ? 0 : prev + 1;
    recipe.rating = next;
    const img = $('#ratingImg', container);
    if (img) img.src = `img/rating/${next}.webp`;
    try {
      await patchRecipe(recipe.id, { rating: next });
    } catch {
      recipe.rating = prev;
      if (img) img.src = `img/rating/${prev}.webp`;
      showToast(t('common.error'), 'error');
    }
  });

  $('#btnShoppingList', container).addEventListener('click', () => {
    const scaledRecipe = recipe.servings
      ? { ...recipe, ingredients: getScaledIngredients(), servings: currentServings }
      : recipe;
    openShoppingListModal(scaledRecipe);
  });

  const cookModeBtn = $('#btnCookMode', container);
  if (cookModeBtn) {
    cookModeBtn.addEventListener('click', () => {
      openCookingMode(recipe, getScaledIngredients());
    });
  }

  // "Cooked today" – PATCH (no ownership required)
  $('#btnCooked', container).addEventListener('click', async () => {
    recipe.cookedDates = recipe.cookedDates || [];
    recipe.cookedDates.push(todayISO());
    recipe.cookedCount = (recipe.cookedCount || 0) + 1;
    await patchRecipe(recipe.id, { cookedDates: recipe.cookedDates, cookedCount: recipe.cookedCount });
    showToast(t('detail.cookedMarked'), 'success');
    renderDetailView(container, recipe);
  });

  // Add note – PATCH (any authenticated user, username stored with note)
  if (loggedIn) {
    $('#btnAddNote', container).addEventListener('click', async () => {
      const text = $('#newNoteText', container).value.trim();
      if (!text) {
        showToast(t('detail.noteRequired'), 'warning');
        return;
      }
      recipe.notes.push({ date: new Date().toISOString(), text, username: user.username });
      await patchRecipe(recipe.id, { notes: recipe.notes });
      showToast(t('detail.noteSaved'), 'success');
      renderDetailView(container, recipe);
    });
  }

  // Delete note – PATCH (own notes or admin)
  container.querySelectorAll('[data-delete-note]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.deleteNote, 10);
      if (!confirm(t('detail.noteDeleteConfirm'))) return;
      recipe.notes.splice(idx, 1);
      await patchRecipe(recipe.id, { notes: recipe.notes });
      showToast(t('detail.noteDeleted'), 'info');
      renderDetailView(container, recipe);
    });
  });

  // Image upload/delete (authorized users only)
  if (canEdit) {
    const imageFileInput = $('#imageFileInput', container);
    if (imageFileInput) {
      imageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const base64 = await compressImageForStorage(file);
          await uploadRecipeImage(recipe.id, base64, 'image/jpeg');
          showToast(t('detail.imageSaved'), 'success');
          recipe.imageBlob = base64;
          recipe.imageMimeType = 'image/jpeg';
          renderDetailView(container, recipe);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const btnDeleteImage = $('#btnDeleteImage', container);
    if (btnDeleteImage) {
      btnDeleteImage.addEventListener('click', async () => {
        if (!confirm(t('detail.imageDeleteConfirm'))) return;
        try {
          await deleteRecipeImage(recipe.id);
          showToast(t('detail.imageDeleted'), 'info');
          recipe.imageBlob = null;
          recipe.imageMimeType = null;
          renderDetailView(container, recipe);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  // Edit button
  if (canEdit) {
    $('#btnEdit', container).addEventListener('click', () => {
      renderEditView(container, recipe);
    });

    // Delete button
    $('#btnDelete', container).addEventListener('click', async () => {
      if (confirm(t('detail.deleteConfirm'))) {
        await deleteRecipe(recipe.id);
        showToast(t('detail.recipeDeleted'), 'info');
        window.location.hash = '#overview';
      }
    });
  }

  // Duplicate button (any logged-in user)
  if (loggedIn) {
    $('#btnDuplicate', container).addEventListener('click', async () => {
      const btn = $('#btnDuplicate', container);
      btn.disabled = true;
      try {
        const { id: _id, createdAt: _ca, updatedAt: _ua, createdBy: _cb, createdByUsername: _cbu,
                cookedDates: _cd, cookedCount: _cc, favorite: _fav, rating: _r, ...fields } = recipe;
        const newId = await addRecipe({ ...fields, title: `Kopie – ${recipe.title}` });
        showToast(t('detail.duplicated', recipe.title), 'success');
        window.location.hash = `#detail/${newId}`;
      } catch (err) {
        console.error('[Duplicate]', err);
        showToast(t('common.error'), 'error');
        btn.disabled = false;
      }
    });
  }
}

async function compressImageForStorage(file) {
  const MAX_PX = 1200;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderEditView(container, recipe) {
  container.innerHTML = `
    <div class="detail">
      <div class="detail__header">
        <button class="btn btn--ghost" id="btnCancelEdit">${t('detail.cancelBtn')}</button>
        <div class="detail__actions">
          <button class="btn btn--primary" id="btnSaveEdit">${t('detail.saveChangesBtn')}</button>
        </div>
      </div>

      <h2 style="margin-bottom: var(--space-xl);">${t('detail.editTitle')}</h2>

      <div class="edit-form" id="editForm"></div>
    </div>
  `;

  const formEl = $('#editForm', container);
  renderRecipeForm(formEl, recipe);

  // Cancel
  $('#btnCancelEdit', container).addEventListener('click', () => {
    renderDetailView(container, recipe);
  });

  // Save
  $('#btnSaveEdit', container).addEventListener('click', async () => {
    const formData = readRecipeForm(formEl);

    // Convert importNotes textarea → notes array (replaces existing notes)
    const { importNotes, ...rest } = formData;
    if (importNotes && importNotes.trim()) {
      rest.notes = importNotes.trim().split('\n').filter(Boolean)
        .map(text => ({ date: new Date().toISOString(), text }));
    } else if (!importNotes) {
      rest.notes = recipe.notes; // unchanged
    } else {
      rest.notes = []; // user cleared the field
    }

    // Merge edited fields into existing recipe
    Object.assign(recipe, rest);

    await updateRecipe(recipe);
    showToast(t('detail.recipeSaved'), 'success');
    renderDetailView(container, recipe);
  });
}
