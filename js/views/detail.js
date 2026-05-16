import { getRecipe, addRecipe, updateRecipe, patchRecipe, deleteRecipe, uploadRecipeImage, deleteRecipeImage, setFavorite, fetchImageByUrl } from '../db.js';
import { generateRecipePDF, generateRecipeA5PDF } from '../pdf-generator.js';
import { $, createElement, formatDate, formatDateTime, todayISO, showToast, categoryChipClass } from '../utils/helpers.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';
import { isAuthenticated, getAuthUser, getAuthToken } from '../utils/auth.js';
import { t, translateCategory, translateDifficulty } from '../i18n.js';
import { openShoppingListModal } from '../shopping-list.js';
import { openCookingMode } from '../cooking-mode.js';
import { scaleIngredient } from '../utils/ingredient-scaler.js';
import { enhanceRecipe } from '../api.js';

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
          ${canEdit ? `<button class="btn btn--ghost" id="btnAiEnhance"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${t('detail.aiEnhanceBtn')}</button>` : ''}
          ${loggedIn ? `<button class="btn btn--ghost" id="btnDuplicate"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> ${t('detail.duplicateBtn')}</button>` : ''}
          <button class="btn btn--primary" id="btnCooked">${t('detail.cookedToday')}</button>
          ${canEdit ? `<button class="btn btn--danger" id="btnDelete">${t('detail.deleteBtn')}</button>` : ''}
        </div>
      </div>

      ${recipe.imageBlob ? `
      <div class="detail__image">
        <div class="detail__image-inner">
          <img src="data:${recipe.imageMimeType || 'image/jpeg'};base64,${recipe.imageBlob}" alt="${esc(recipe.title)}" class="detail__image-img" id="detailImageThumb" loading="lazy" />
          ${canEdit ? `<div class="detail__image-actions">
            <label class="btn btn--ghost btn--sm detail__image-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              ${t('detail.imageChange')}
              <input type="file" id="imageFileInput" accept="image/*" class="hidden" />
            </label>
            <button class="btn btn--ghost btn--sm detail__image-btn" id="btnImageFromUrl">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              ${t('detail.imageUrlBtn')}
            </button>
            <button class="btn btn--ghost btn--sm detail__image-btn" id="btnDeleteImage">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              ${t('detail.imageDelete')}
            </button>
          </div>` : ''}
        </div>
        ${canEdit ? `<div class="detail__image-url-row hidden" id="imageUrlRow">
          <input type="url" id="imageUrlInput" placeholder="${t('detail.imageUrlPlaceholder')}" class="input" />
          <button class="btn btn--primary btn--sm" id="btnConfirmImageUrl">${t('detail.imageUrlLoad')}</button>
        </div>` : ''}
      </div>` : `
      ${canEdit ? `<div class="detail__image detail__image--empty">
        <label class="btn btn--ghost detail__image-upload-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          ${t('detail.imageUpload')}
          <input type="file" id="imageFileInput" accept="image/*" class="hidden" />
        </label>
        <div class="detail__image-url-row detail__image-url-row--standalone">
          <input type="url" id="imageUrlInput" placeholder="${t('detail.imageUrlPlaceholder')}" class="input" />
          <button class="btn btn--ghost btn--sm" id="btnConfirmImageUrl">${t('detail.imageUrlLoad')}</button>
        </div>
      </div>` : ''}`}

      <div class="detail__title-row">
        <h1 class="detail__title">${esc(recipe.title)}</h1>
        <div class="detail__title-actions">
          ${splitIntoSteps(recipe.recipeText || '').length > 0 ? `
          <button class="btn btn--primary btn--sm" id="btnCookMode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>
            <span class="cook-mode-label">${t('detail.cookModeBtn')}</span>
          </button>` : ''}
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
        ${recipe.servings ? `<span class="chip chip--servings">${t('detail.servingsScaled', recipe.servings)}</span>` : ''}
      </div>

      ${recipe.description ? `<p class="detail__desc">${esc(recipe.description)}</p>` : ''}

      ${recipe.sourceNote ? `<p class="detail__source-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        ${t('detail.sourceNote')}: <em>${esc(recipe.sourceNote)}</em>
      </p>` : ''}

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

      <details class="detail__pdf">
        <summary class="detail__pdf-summary">${t('detail.pdfSection')}</summary>
        ${recipe.imageBlob ? `
        <label class="settings__checkbox-label" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="pdfIncludeImage" />
          ${t('detail.pdfIncludeImage')}
        </label>` : ''}
        <label class="settings__checkbox-label" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="pdfIncludeNotes" checked />
          ${t('detail.pdfIncludeNotes')}
        </label>
        <label class="settings__checkbox-label" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="pdfIncludeTags" />
          ${t('detail.pdfIncludeTags')}
        </label>
        <div class="pdf-actions">
          <a id="pdfDownload" class="btn btn--secondary">${t('detail.pdfA4Download')}</a>
          <button id="pdfOpen" class="btn btn--primary">${t('detail.pdfA4Open')}</button>
          <a id="pdfA5Download" class="btn btn--secondary">${t('detail.pdfA5Download')}</a>
          <button id="pdfA5Open" class="btn btn--primary">${t('detail.pdfA5Open')}</button>
        </div>
      </details>

      <div class="detail__shopping">
        <button class="btn btn--secondary" id="btnShoppingList">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          ${t('detail.shoppingListBtn')}
        </button>
        ${recipe.servings ? `
        <div class="detail__scaler-mini">
          <button class="scaler__btn--mini" id="scalerMinus">−</button>
          <span class="scaler__label--mini" id="scalerLabel">${recipe.servings}</span>
          <button class="scaler__btn--mini" id="scalerPlus">+</button>
        </div>` : ''}
      </div>

      <!-- Notes Section -->
      <div class="detail__notes">
        <h3>${t('detail.notesSection')}</h3>
        <div class="notes-list" id="notesList">
          ${recipe.notes.length === 0
            ? ''
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
        <div class="stat-mini-row">
          <span class="stat-mini"><strong id="cookedCount">${recipe.cookedCount || 0}</strong> ${t('detail.timesCooked')}</span>
          <span class="stat-mini">${t('detail.lastCooked')} ${recipe.cookedDates?.length ? formatDate(recipe.cookedDates[recipe.cookedDates.length - 1]) : '–'}</span>
          <span class="stat-mini">${t('detail.importedOn')}: ${formatDate(recipe.createdAt)}</span>
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

    <!-- KI-Ergänzungs-Modal -->
    <div class="modal hidden" id="aiModal">
      <div class="modal__backdrop" id="aiModalBackdrop"></div>
      <div class="modal__box">
        <div class="modal__header">
          <h2>${t('detail.aiModalTitle')}</h2>
          <button class="modal__close" id="btnAiClose">&times;</button>
        </div>
        <div class="modal__body" id="aiModalBody">
          <div class="spinner" id="aiSpinner"></div>
        </div>
        <div class="modal__footer hidden" id="aiModalFooter">
          <button class="btn btn--primary" id="btnAiApply">${t('detail.aiModalApply')}</button>
          <button class="btn btn--ghost" id="btnAiClose2">${t('detail.aiModalClose')}</button>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
    <div class="detail__lightbox hidden" id="detailLightbox">
      <div class="detail__lightbox-backdrop" id="lightboxBackdrop"></div>
      <img class="detail__lightbox-img" id="lightboxImg" alt="" />
    </div>
  `;

  // Lightbox for hero image
  const thumb = $('#detailImageThumb', container);
  if (thumb) {
    thumb.addEventListener('click', () => {
      const lb = $('#detailLightbox', container);
      $('#lightboxImg', container).src = thumb.src;
      lb.classList.remove('hidden');
    });
    const closeLightbox = () => $('#detailLightbox', container)?.classList.add('hidden');
    $('#lightboxBackdrop', container)?.addEventListener('click', closeLightbox);
    $('#lightboxImg', container)?.addEventListener('click', closeLightbox);
  }

  // PDF on demand – cache invalidated when "include image" checkbox changes
  let pdfUrl = null;
  let pdfA5Url = null;
  let lastIncludeImage = false;

  function getIncludeImage() {
    return !!$('#pdfIncludeImage', container)?.checked;
  }

  function getIncludeNotes() {
    return !!$('#pdfIncludeNotes', container)?.checked;
  }

  function getIncludeTags() {
    return !!$('#pdfIncludeTags', container)?.checked;
  }

  function invalidatePdfCache() {
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; }
    if (pdfA5Url) { URL.revokeObjectURL(pdfA5Url); pdfA5Url = null; }
  }

  ['#pdfIncludeImage', '#pdfIncludeNotes', '#pdfIncludeTags'].forEach(id => {
    const el = $(id, container);
    if (el) el.addEventListener('change', invalidatePdfCache);
  });

  function getPdfUrl() {
    const inc = getIncludeImage();
    if (!pdfUrl || inc !== lastIncludeImage) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      lastIncludeImage = inc;
      const blob = generateRecipePDF(recipe, { includeImage: inc, includeNotes: getIncludeNotes(), includeTags: getIncludeTags() });
      pdfUrl = URL.createObjectURL(blob);
    }
    return pdfUrl;
  }

  function getPdfA5Url() {
    const inc = getIncludeImage();
    if (!pdfA5Url || inc !== lastIncludeImage) {
      if (pdfA5Url) URL.revokeObjectURL(pdfA5Url);
      lastIncludeImage = inc;
      const blob = generateRecipeA5PDF(recipe, { includeImage: inc, includeNotes: getIncludeNotes(), includeTags: getIncludeTags() });
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

  // Mini scaler – only affects shopping list
  let currentServings = recipe.servings || 1;
  const baseServings = recipe.servings || 1;
  if ($('#scalerMinus', container)) {
    const updateMiniScaler = () => {
      const el = $('#scalerLabel', container);
      if (el) el.textContent = currentServings;
    };
    $('#scalerMinus', container).addEventListener('click', () => {
      if (currentServings > 1) { currentServings--; updateMiniScaler(); }
    });
    $('#scalerPlus', container).addEventListener('click', () => {
      if (currentServings < 99) { currentServings++; updateMiniScaler(); }
    });
  }

  $('#btnShoppingList', container).addEventListener('click', () => {
    const factor = currentServings / baseServings;
    const scaledRecipe = factor !== 1
      ? { ...recipe, ingredients: (recipe.ingredients || []).map(i => scaleIngredient(i, factor)), servings: currentServings }
      : recipe;
    openShoppingListModal(scaledRecipe);
  });

  const cookModeBtn = $('#btnCookMode', container);
  if (cookModeBtn) {
    cookModeBtn.addEventListener('click', () => {
      openCookingMode(recipe, recipe.ingredients || []);
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

    const btnImageFromUrl = $('#btnImageFromUrl', container);
    if (btnImageFromUrl) {
      btnImageFromUrl.addEventListener('click', () => {
        const row = $('#imageUrlRow', container);
        row.classList.toggle('hidden');
        if (!row.classList.contains('hidden')) $('#imageUrlInput', container).focus();
      });
    }

    const btnConfirmImageUrl = $('#btnConfirmImageUrl', container);
    if (btnConfirmImageUrl) {
      const loadImageFromUrl = async () => {
        const input = $('#imageUrlInput', container);
        const url = input.value.trim();
        if (!url) return;
        btnConfirmImageUrl.disabled = true;
        try {
          const { imageBlob, imageMimeType } = await fetchImageByUrl(url);
          const compressed = await compressBase64ForStorage(imageBlob, imageMimeType);
          await uploadRecipeImage(recipe.id, compressed, 'image/jpeg');
          showToast(t('detail.imageSaved'), 'success');
          recipe.imageBlob = compressed;
          recipe.imageMimeType = 'image/jpeg';
          renderDetailView(container, recipe);
        } catch (err) {
          showToast(err.message, 'error');
          btnConfirmImageUrl.disabled = false;
        }
      };
      btnConfirmImageUrl.addEventListener('click', loadImageFromUrl);
      const urlInput = $('#imageUrlInput', container);
      if (urlInput) urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadImageFromUrl(); });
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
  // KI-Ergänzung
  if (canEdit) {
    const btnAiEnhance = $('#btnAiEnhance', container);
    if (btnAiEnhance) {
      btnAiEnhance.addEventListener('click', () => openAiModal(container, recipe));
    }
  }
}

async function openAiModal(container, recipe) {
  const modal = $('#aiModal', container);
  const body = $('#aiModalBody', container);
  const footer = $('#aiModalFooter', container);
  const spinner = $('#aiSpinner', container);

  modal.classList.remove('hidden');
  body.innerHTML = '<div class="spinner"></div>';
  footer.classList.add('hidden');

  let suggestions;
  try {
    suggestions = await enhanceRecipe(recipe);
  } catch (err) {
    body.innerHTML = `<p class="error-msg">${t('detail.aiEnhanceError')}: ${err.message}</p>`;
    footer.classList.remove('hidden');
    footer.querySelector('#btnAiApply').classList.add('hidden');
    setupAiModalClose(container, modal);
    return;
  }

  const hasSides = suggestions.sides?.length > 0;
  const hasTags = suggestions.tags?.length > 0;
  const descText = suggestions.description?.trim() || '';
  const imageQuery = suggestions.imageQuery || recipe.title || '';

  if (!hasSides && !hasTags && !descText) {
    body.innerHTML = `<p>${t('detail.aiNoSuggestions')}</p>`;
    footer.classList.remove('hidden');
    footer.querySelector('#btnAiApply').classList.add('hidden');
    setupAiModalClose(container, modal);
    return;
  }

  body.innerHTML = `
    ${hasSides ? `
    <div class="ai-suggestion">
      <label class="ai-suggestion__label">
        <input type="checkbox" id="aiUseSides" checked />
        <strong>${t('detail.aiModalSides')}</strong>
      </label>
      <div class="ai-suggestion__chips">
        ${suggestions.sides.map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}
      </div>
    </div>` : ''}
    ${hasTags ? `
    <div class="ai-suggestion">
      <label class="ai-suggestion__label">
        <input type="checkbox" id="aiUseTags" checked />
        <strong>${t('detail.aiModalTags')}</strong>
      </label>
      <div class="ai-suggestion__chips">
        ${suggestions.tags.map(s => `<span class="chip chip--tag">${esc(s)}</span>`).join(' ')}
      </div>
    </div>` : ''}
    ${descText ? `
    <div class="ai-suggestion">
      <label class="ai-suggestion__label">
        <input type="checkbox" id="aiUseDesc" />
        <strong>${t('detail.aiModalDesc')}</strong>
      </label>
      <p class="ai-suggestion__text">${esc(descText)}</p>
    </div>` : ''}
    <div class="ai-suggestion">
      <strong>${t('detail.aiModalImage')}</strong>
      <div id="aiImageSection" style="margin-top: var(--space-sm);">
        <button class="btn btn--ghost btn--sm" id="btnAiImageSearch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          ${t('detail.aiImageSearchBtn')}
        </button>
      </div>
    </div>
  `;

  footer.classList.remove('hidden');
  footer.querySelector('#btnAiApply').classList.remove('hidden');

  let selectedImageBlob = null;
  let selectedImageMime = null;

  $('#btnAiImageSearch', container)?.addEventListener('click', async () => {
    const btn = $('#btnAiImageSearch', container);
    const section = $('#aiImageSection', container);
    btn.disabled = true;
    btn.textContent = t('detail.aiImageSearching');
    try {
      const token = getAuthToken();
      const resp = await fetch(`/api/ai/pixabay?q=${encodeURIComponent(imageQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || resp.statusText);
      }
      const { hits } = await resp.json();
      if (!hits?.length) {
        section.innerHTML = `<p>${t('detail.aiImageNoResults')}</p>`;
        return;
      }
      section.innerHTML = `
        <div class="ai-image-gallery">
          ${hits.map((h, i) => `
            <button class="ai-image-thumb" data-img-idx="${i}" type="button">
              <img src="${h.previewURL}" alt="${esc(h.tags || '')}" loading="lazy" />
            </button>
          `).join('')}
        </div>
        <p class="ai-image-hint hidden" id="aiImageHint">${t('detail.aiImageSelected')}</p>
      `;
      section.querySelectorAll('.ai-image-thumb').forEach((btn2, i) => {
        btn2.addEventListener('click', () => {
          section.querySelectorAll('.ai-image-thumb').forEach(b => b.classList.remove('ai-image-thumb--selected'));
          btn2.classList.add('ai-image-thumb--selected');
          selectedImageBlob = null;
          selectedImageMime = null;
          // Store the webformat URL for download on apply
          btn2.dataset.webformatUrl = hits[i].webformatURL;
          $('#aiImageHint', section).classList.remove('hidden');
        });
      });
    } catch (err) {
      section.innerHTML = `<p class="error-msg">${err.message}</p>`;
    }
  });

  const closeModal = () => {
    modal.classList.add('hidden');
    selectedImageBlob = null;
    selectedImageMime = null;
  };

  setupAiModalClose(container, modal, closeModal);

  $('#btnAiApply', container).addEventListener('click', async () => {
    const btn = $('#btnAiApply', container);
    btn.disabled = true;

    const patches = {};

    if (hasSides && $('#aiUseSides', container)?.checked) {
      patches.sides = suggestions.sides;
    }
    if (hasTags && $('#aiUseTags', container)?.checked) {
      const existing = recipe.tags || [];
      const merged = [...new Set([...existing, ...suggestions.tags])];
      patches.tags = merged;
    }
    if (descText && $('#aiUseDesc', container)?.checked) {
      patches.description = descText;
    }

    // Download selected image if any
    const selectedThumb = body.querySelector('.ai-image-thumb--selected');
    if (selectedThumb?.dataset.webformatUrl) {
      try {
        const token = getAuthToken();
        const imgResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(selectedThumb.dataset.webformatUrl)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          const compressed = await compressBase64ForStorage(imgData.imageBlob, imgData.imageMimeType);
          await uploadRecipeImage(recipe.id, compressed, 'image/jpeg');
          recipe.imageBlob = compressed;
          recipe.imageMimeType = 'image/jpeg';
        }
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    if (Object.keys(patches).length > 0) {
      Object.assign(recipe, patches);
      await patchRecipe(recipe.id, patches);
    }

    showToast(t('detail.aiApplied'), 'success');
    closeModal();
    renderDetailView(container, recipe);
  });
}

function setupAiModalClose(container, modal, closeModal) {
  const doClose = closeModal || (() => modal.classList.add('hidden'));
  const backdrop = $('#aiModalBackdrop', container);
  const closeBtn = $('#btnAiClose', container);
  const closeBtn2 = $('#btnAiClose2', container);
  if (backdrop) backdrop.addEventListener('click', doClose);
  if (closeBtn) closeBtn.addEventListener('click', doClose);
  if (closeBtn2) closeBtn2.addEventListener('click', doClose);
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

async function compressBase64ForStorage(base64, mimeType) {
  const MAX_PX = 1200;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
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
    formData.notes = recipe.notes; // notes managed via chat interface only

    // Merge edited fields into existing recipe
    Object.assign(recipe, formData);

    await updateRecipe(recipe);
    showToast(t('detail.recipeSaved'), 'success');
    renderDetailView(container, recipe);
  });
}
