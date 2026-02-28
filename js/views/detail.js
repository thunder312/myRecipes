import { getRecipe, updateRecipe, deleteRecipe } from '../db.js';
import { generateRecipePDF } from '../pdf-generator.js';
import { $, createElement, formatDate, todayISO, showToast, categoryChipClass } from '../utils/helpers.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';
import { isAuthenticated } from '../utils/auth.js';

export async function render(container, recipeId) {
  const id = parseInt(recipeId, 10);
  const recipe = await getRecipe(id);

  if (!recipe) {
    container.innerHTML = '<div class="error-state"><h2>Rezept nicht gefunden</h2><a href="#overview" class="btn">Zurück zur Übersicht</a></div>';
    return;
  }

  // Ensure notes array exists (migration for older recipes)
  if (!Array.isArray(recipe.notes)) {
    recipe.notes = [];
  }

  renderDetailView(container, recipe);
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDetailView(container, recipe) {
  const canEdit = isAuthenticated();

  container.innerHTML = `
    <div class="detail">
      <div class="detail__header">
        <a href="#overview" class="btn btn--ghost">&larr; Zurück</a>
        <div class="detail__actions">
          ${canEdit ? '<button class="btn btn--secondary" id="btnEdit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Bearbeiten</button>' : ''}
          <button class="btn btn--primary" id="btnCooked">Heute gekocht</button>
          ${canEdit ? '<button class="btn btn--danger" id="btnDelete">Löschen</button>' : ''}
        </div>
      </div>

      <h1 class="detail__title">${esc(recipe.title)}</h1>

      <div class="detail__meta">
        ${recipe.category ? `<span class="chip ${categoryChipClass(recipe.category)}">${esc(recipe.category)}</span>` : ''}
        ${recipe.origin ? `<span class="chip chip--origin">${esc(recipe.origin)}</span>` : ''}
        ${recipe.prepTime ? `<span class="chip chip--time">${recipe.prepTime} Min.</span>` : ''}
        ${recipe.difficulty ? `<span class="chip chip--difficulty">${esc(recipe.difficulty)}</span>` : ''}
        ${recipe.servings ? `<span class="chip">${recipe.servings} Portionen</span>` : ''}
        ${recipe.mainIngredient ? `<span class="chip chip--ingredient">${esc(recipe.mainIngredient)}</span>` : ''}
      </div>

      ${recipe.description ? `<p class="detail__desc">${esc(recipe.description)}</p>` : ''}

      ${recipe.tags?.length ? `
        <div class="detail__tags">
          <strong>Tags:</strong> ${recipe.tags.map(t => `<span class="chip chip--tag">${esc(t)}</span>`).join(' ')}
        </div>
      ` : ''}

      ${recipe.sides?.length ? `
        <div class="detail__sides">
          <strong>Passende Beilagen:</strong> ${recipe.sides.map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}
        </div>
      ` : ''}

      ${recipe.ingredients?.length ? `
        <div class="detail__ingredients">
          <h3>Zutaten</h3>
          <ul>${recipe.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${recipe.recipeText ? `
        <div class="detail__recipe-text">
          <h3>Zubereitung</h3>
          <p class="recipe-text">${esc(recipe.recipeText).replace(/\n/g, '<br>')}</p>
        </div>
      ` : ''}

      <div class="detail__pdf" id="pdfContainer">
        <h3>Rezept-PDF</h3>
        <div class="pdf-actions" id="pdfActions" style="display:none">
          <a id="pdfDownload" class="btn btn--secondary" download>PDF herunterladen</a>
          <button id="pdfOpen" class="btn btn--primary">PDF öffnen</button>
        </div>
        <div id="pdfEmbed"></div>
      </div>

      <!-- Notes Section -->
      <div class="detail__notes">
        <h3>Notizen</h3>
        <p class="detail__notes-hint">Halte fest, was dir beim Kochen aufgefallen ist – geänderte Zutaten, Tipps, Variationen.</p>
        <div class="notes-list" id="notesList">
          ${recipe.notes.length === 0
            ? '<p class="notes-list__empty">Noch keine Notizen vorhanden.</p>'
            : recipe.notes.map((note, idx) => `
              <div class="note-card" data-index="${idx}">
                <div class="note-card__header">
                  <span class="note-card__date">${formatDate(note.date)}</span>
                  ${canEdit ? `<button class="note-card__delete" data-delete-note="${idx}" title="Notiz löschen">&times;</button>` : ''}
                </div>
                <div class="note-card__text">${esc(note.text)}</div>
              </div>
            `).join('')}
        </div>
        <div class="notes-add">
          <textarea id="newNoteText" class="input input--textarea" rows="3" placeholder="Neue Notiz schreiben..."></textarea>
          <button class="btn btn--secondary" id="btnAddNote">Notiz hinzufügen</button>
        </div>
      </div>

      <div class="detail__stats">
        <h3>Koch-Statistik</h3>
        <div class="stat-grid">
          <div class="stat">
            <span class="stat__value" id="cookedCount">${recipe.cookedCount || 0}</span>
            <span class="stat__label">× gekocht</span>
          </div>
          <div class="stat">
            <span class="stat__value">${recipe.cookedDates?.length ? formatDate(recipe.cookedDates[recipe.cookedDates.length - 1]) : '–'}</span>
            <span class="stat__label">Zuletzt gekocht</span>
          </div>
          <div class="stat">
            <span class="stat__value">${formatDate(recipe.createdAt)}</span>
            <span class="stat__label">Importiert am</span>
          </div>
        </div>
        ${recipe.cookedDates?.length ? `
          <details class="detail__history">
            <summary>Koch-Historie (${recipe.cookedDates.length} Einträge)</summary>
            <ul>${[...recipe.cookedDates].reverse().map(d => `<li>${formatDate(d)}</li>`).join('')}</ul>
          </details>
        ` : ''}
      </div>

      <div class="detail__source">
        <small>Quelle: ${esc(recipe.sourceType)} – ${esc(recipe.sourceRef) || '–'}</small>
      </div>
    </div>
  `;

  // Embed PDF
  if (recipe.pdfBlob instanceof Blob) {
    const url = URL.createObjectURL(recipe.pdfBlob);
    const filename = `${recipe.title || 'rezept'}.pdf`;

    const actionsEl = $('#pdfActions', container);
    actionsEl.style.display = '';
    const dlBtn = $('#pdfDownload', container);
    dlBtn.href = url;
    dlBtn.download = filename;
    $('#pdfOpen', container).addEventListener('click', () => window.open(url, '_blank'));

    $('#pdfEmbed', container).innerHTML = `<iframe src="${url}" class="pdf-frame" title="Rezept-PDF"></iframe>`;
  }

  // "Heute gekocht"
  $('#btnCooked', container).addEventListener('click', async () => {
    recipe.cookedDates = recipe.cookedDates || [];
    recipe.cookedDates.push(todayISO());
    recipe.cookedCount = (recipe.cookedCount || 0) + 1;
    await updateRecipe(recipe);
    showToast(`"${recipe.title}" als gekocht markiert!`, 'success');
    renderDetailView(container, recipe);
  });

  // Add note
  $('#btnAddNote', container).addEventListener('click', async () => {
    const text = $('#newNoteText', container).value.trim();
    if (!text) {
      showToast('Bitte Notiz eingeben.', 'warning');
      return;
    }
    recipe.notes.push({ date: new Date().toISOString(), text });
    await updateRecipe(recipe);
    showToast('Notiz gespeichert.', 'success');
    renderDetailView(container, recipe);
  });

  // Delete notes
  container.querySelectorAll('[data-delete-note]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.deleteNote, 10);
      if (!confirm('Notiz wirklich löschen?')) return;
      recipe.notes.splice(idx, 1);
      await updateRecipe(recipe);
      showToast('Notiz gelöscht.', 'info');
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
      if (confirm(`Rezept "${recipe.title}" wirklich löschen?`)) {
        await deleteRecipe(recipe.id);
        showToast('Rezept gelöscht.', 'info');
        window.location.hash = '#overview';
      }
    });
  }
}

function renderEditView(container, recipe) {
  container.innerHTML = `
    <div class="detail">
      <div class="detail__header">
        <button class="btn btn--ghost" id="btnCancelEdit">&larr; Abbrechen</button>
        <div class="detail__actions">
          <button class="btn btn--primary" id="btnSaveEdit">Änderungen speichern</button>
        </div>
      </div>

      <h2 style="margin-bottom: var(--space-xl);">Rezept bearbeiten</h2>

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

    // Merge edited fields into existing recipe
    Object.assign(recipe, formData);

    // Regenerate PDF with updated data
    recipe.pdfBlob = generateRecipePDF({
      ...recipe,
      recipeText: recipe.recipeText || ''
    });

    await updateRecipe(recipe);
    showToast(`"${recipe.title}" aktualisiert!`, 'success');
    renderDetailView(container, recipe);
  });
}
