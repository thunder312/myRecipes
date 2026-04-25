import { getRecipe, updateRecipe, patchRecipe, deleteRecipe } from '../db.js';
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
          <button class="btn btn--primary" id="btnCooked">${t('detail.cookedToday')}</button>
          ${canEdit ? `<button class="btn btn--danger" id="btnDelete">${t('detail.deleteBtn')}</button>` : ''}
        </div>
      </div>

      <h1 class="detail__title">${esc(recipe.title)}</h1>

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

  // PDF on demand
  let pdfUrl = null;
  function getPdfUrl() {
    if (!pdfUrl) {
      const blob = generateRecipePDF(recipe);
      pdfUrl = URL.createObjectURL(blob);
    }
    return pdfUrl;
  }

  let pdfA5Url = null;
  function getPdfA5Url() {
    if (!pdfA5Url) {
      const blob = generateRecipeA5PDF(recipe);
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
