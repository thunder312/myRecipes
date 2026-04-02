import {
  getAllCookbooks, addCookbook, updateCookbook, deleteCookbook,
  getAllRecipes, assignRecipesToCookbook, getCookbookRecipes, setRecipeCookbooks, clearCookbook,
} from '../db.js';
import { $, showToast } from '../utils/helpers.js';
import { isAuthenticated, isAdmin } from '../utils/auth.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { generateCookbookPDF } from '../pdf-generator.js';

export async function render(container) {
  await ensureAuthenticated(container, () => renderCookbooks(container));
}

async function renderCookbooks(container) {
  const [cookbooks, allRecipes] = await Promise.all([getAllCookbooks(), getAllRecipes()]);

  container.innerHTML = `
    <div class="cookbooks">
      <div class="cookbooks__header">
        <h1>Kochbücher</h1>
        <button class="btn btn--primary" id="btnNewCookbook">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neues Kochbuch
        </button>
      </div>

      <div class="cookbooks__list" id="cookbookList"></div>

      <!-- Cookbook form modal -->
      <div class="modal hidden" id="cookbookModal">
        <div class="modal__backdrop" id="modalBackdrop"></div>
        <div class="modal__box">
          <h2 id="modalTitle">Kochbuch anlegen</h2>
          <div class="form-group">
            <label for="cbName">Name *</label>
            <input type="text" id="cbName" class="input" placeholder="z. B. Familienrezepte" />
          </div>
          <div class="form-group">
            <label for="cbDescription">Beschreibung</label>
            <input type="text" id="cbDescription" class="input" placeholder="Kurze Beschreibung" />
          </div>
          <div class="form-group">
            <label for="cbCoverTitle">Deckblatt-Titel</label>
            <input type="text" id="cbCoverTitle" class="input" placeholder="Erscheint groß auf dem Deckblatt" />
          </div>
          <div class="form-group">
            <label for="cbCoverSubtitle">Deckblatt-Untertitel</label>
            <input type="text" id="cbCoverSubtitle" class="input" placeholder="z. B. Zusammengestellt von Familie Müller" />
          </div>
          <div class="modal__actions">
            <button class="btn btn--primary" id="btnSaveCookbook">Speichern</button>
            <button class="btn btn--ghost" id="btnCancelModal">Abbrechen</button>
          </div>
        </div>
      </div>

      <!-- Bulk assign modal -->
      <div class="modal hidden" id="assignModal">
        <div class="modal__backdrop" id="assignBackdrop"></div>
        <div class="modal__box modal__box--wide">
          <h2 id="assignTitle">Rezepte zuordnen</h2>
          <p class="settings__hint" id="assignHint"></p>
          <div class="assign-filters">
            <input type="text" id="assignSearch" class="input" placeholder="Rezept suchen..." />
            <div class="assign-select-btns">
              <button class="btn btn--ghost btn--sm" id="btnAssignSelectAll">Alle auswählen</button>
              <button class="btn btn--ghost btn--sm" id="btnAssignSelectNone">Keine</button>
            </div>
          </div>
          <div class="assign-list" id="assignList"></div>
          <div class="modal__actions">
            <button class="btn btn--primary" id="btnConfirmAssign">Zuordnen</button>
            <button class="btn btn--ghost" id="btnCancelAssign">Abbrechen</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let editingCookbookId = null;
  let assignTargetCookbookId = null;
  let assignAllRecipes = [];
  let filteredAssignRecipes = [];

  function renderList() {
    const list = $('#cookbookList', container);
    list.innerHTML = cookbooks.map(cb => `
      <div class="cookbook-card" data-id="${cb.id}">
        <div class="cookbook-card__cover">
          <svg class="cookbook-card__book-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <div class="cookbook-card__name">${esc(cb.name)}</div>
          <div class="cookbook-card__count">${cb.recipeCount ?? 0} Rezept${(cb.recipeCount ?? 0) !== 1 ? 'e' : ''}</div>
        </div>
        <div class="cookbook-card__body">
          ${cb.description ? `<p class="cookbook-card__desc">${esc(cb.description)}</p>` : ''}
          <div class="cookbook-card__actions">
            <div class="cookbook-card__actions-primary">
              <button class="btn btn--ghost btn--sm" data-action="assign" data-id="${cb.id}" title="Rezepte zuordnen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                Zuordnen
              </button>
              <button class="btn btn--ghost btn--sm" data-action="export" data-id="${cb.id}" title="Als PDF exportieren">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                PDF
              </button>
            </div>
            <div class="cookbook-card__actions-secondary">
              <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${cb.id}" title="Bearbeiten">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              ${isAdmin() ? `<button class="btn btn--ghost btn--sm btn--danger-text" data-action="clear" data-id="${cb.id}" title="Alle Rezepte aus Kochbuch entfernen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>` : ''}
              ${cb.id !== 1 ? `<button class="btn btn--ghost btn--sm btn--danger-text" data-action="delete" data-id="${cb.id}" title="Löschen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // --- Modal helpers ---

  function openModal(cookbook = null) {
    editingCookbookId = cookbook ? cookbook.id : null;
    $('#modalTitle', container).textContent = cookbook ? 'Kochbuch bearbeiten' : 'Kochbuch anlegen';
    $('#cbName', container).value = cookbook ? cookbook.name : '';
    $('#cbDescription', container).value = cookbook ? (cookbook.description || '') : '';
    $('#cbCoverTitle', container).value = cookbook ? (cookbook.coverTitle || '') : '';
    $('#cbCoverSubtitle', container).value = cookbook ? (cookbook.coverSubtitle || '') : '';
    $('#cookbookModal', container).classList.remove('hidden');
    $('#cbName', container).focus();
  }

  function closeModal() {
    $('#cookbookModal', container).classList.add('hidden');
    editingCookbookId = null;
  }

  // --- Assign modal ---

  async function openAssignModal(cookbookId) {
    assignTargetCookbookId = cookbookId;
    const cb = cookbooks.find(c => c.id === cookbookId);

    // Get all recipes and which are already in this cookbook
    assignAllRecipes = await getAllRecipes();
    const alreadyIn = await getCookbookRecipes(cookbookId);
    const alreadyInIds = new Set(alreadyIn.map(r => r.id));

    $('#assignTitle', container).textContent = `Rezepte zuordnen: ${cb.name}`;
    $('#assignHint', container).textContent = `Wähle Rezepte aus, die dem Kochbuch „${cb.name}" zugeordnet werden sollen. Bereits zugeordnete Rezepte sind vorausgewählt.`;
    $('#assignSearch', container).value = '';

    filteredAssignRecipes = [...assignAllRecipes];
    renderAssignList(filteredAssignRecipes, alreadyInIds);
    $('#assignModal', container).classList.remove('hidden');

    $('#assignSearch', container).addEventListener('input', () => {
      const q = $('#assignSearch', container).value.toLowerCase();
      filteredAssignRecipes = assignAllRecipes.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
      );
      renderAssignList(filteredAssignRecipes, alreadyInIds);
    });

    $('#btnAssignSelectAll', container).onclick = () => {
      container.querySelectorAll('#assignList input[type="checkbox"]').forEach(cb => cb.checked = true);
    };
    $('#btnAssignSelectNone', container).onclick = () => {
      container.querySelectorAll('#assignList input[type="checkbox"]').forEach(cb => cb.checked = false);
    };
  }

  function renderAssignList(recipes, checkedIds) {
    const list = $('#assignList', container);
    list.innerHTML = recipes.map(r => `
      <label class="assign-item">
        <input type="checkbox" data-recipe-id="${r.id}" ${checkedIds.has(r.id) ? 'checked' : ''} />
        <span class="assign-item__title">${esc(r.title)}</span>
        ${r.category ? `<span class="chip chip--sm">${esc(r.category)}</span>` : ''}
      </label>
    `).join('');
  }

  function closeAssignModal() {
    $('#assignModal', container).classList.add('hidden');
    assignTargetCookbookId = null;
  }

  // --- Export cookbook as PDF ---

  async function exportCookbookPDF(cookbookId) {
    const cb = cookbooks.find(c => c.id === cookbookId);
    if (!cb) return;

    try {
      showToast('PDF wird erstellt...', 'info');
      const recipes = await getCookbookRecipes(cookbookId);
      if (recipes.length === 0) {
        showToast('Dieses Kochbuch enthält noch keine Rezepte.', 'warning');
        return;
      }
      const blob = generateCookbookPDF(cb, recipes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (cb.name || 'kochbuch').replace(/[^a-z0-9äöü]/gi, '-').toLowerCase();
      a.download = `${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`PDF für „${cb.name}" heruntergeladen.`, 'success');
    } catch (err) {
      showToast(`PDF-Fehler: ${err.message}`, 'error');
    }
  }

  // --- Event listeners ---

  $('#btnNewCookbook', container).addEventListener('click', () => openModal());

  $('#btnSaveCookbook', container).addEventListener('click', async () => {
    const name = $('#cbName', container).value.trim();
    if (!name) { showToast('Bitte einen Namen eingeben.', 'warning'); return; }

    const data = {
      name,
      description: $('#cbDescription', container).value.trim(),
      coverTitle: $('#cbCoverTitle', container).value.trim() || name,
      coverSubtitle: $('#cbCoverSubtitle', container).value.trim(),
    };

    try {
      if (editingCookbookId !== null) {
        await updateCookbook({ ...data, id: editingCookbookId });
        const idx = cookbooks.findIndex(c => c.id === editingCookbookId);
        if (idx >= 0) cookbooks[idx] = { ...cookbooks[idx], ...data };
        showToast('Kochbuch aktualisiert.', 'success');
      } else {
        const id = await addCookbook(data);
        cookbooks.push({ id, ...data, createdAt: new Date().toISOString() });
        showToast('Kochbuch erstellt.', 'success');
      }
      closeModal();
      renderList();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  });

  $('#btnCancelModal', container).addEventListener('click', closeModal);
  $('#modalBackdrop', container).addEventListener('click', closeModal);

  $('#btnConfirmAssign', container).addEventListener('click', async () => {
    const checkboxes = container.querySelectorAll('#assignList input[type="checkbox"]:checked');
    const recipeIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.recipeId, 10));
    try {
      await assignRecipesToCookbook(recipeIds, assignTargetCookbookId);
      showToast(`${recipeIds.length} Rezept${recipeIds.length !== 1 ? 'e' : ''} zugeordnet.`, 'success');
      closeAssignModal();
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    }
  });

  $('#btnCancelAssign', container).addEventListener('click', closeAssignModal);
  $('#assignBackdrop', container).addEventListener('click', closeAssignModal);

  // Delegate clicks on cookbook cards
  $('#cookbookList', container).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;

    if (action === 'edit') {
      const cb = cookbooks.find(c => c.id === id);
      if (cb) openModal(cb);
    } else if (action === 'delete') {
      if (id === 1) { showToast('Das Standard-Kochbuch kann nicht gelöscht werden.', 'warning'); return; }
      if (!confirm('Kochbuch wirklich löschen? Die Rezepte bleiben erhalten.')) return;
      try {
        await deleteCookbook(id);
        const idx = cookbooks.findIndex(c => c.id === id);
        if (idx >= 0) cookbooks.splice(idx, 1);
        showToast('Kochbuch gelöscht.', 'success');
        renderList();
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
    } else if (action === 'clear') {
      const cb = cookbooks.find(c => c.id === id);
      const hint = id === 1
        ? 'Rezepte werden automatisch in die persönlichen Kochbücher ihrer Ersteller verschoben.'
        : 'Die Rezepte bleiben erhalten, werden aber aus diesem Kochbuch entfernt.';
      if (!confirm(`Alle Rezepte aus „${cb.name}" entfernen?\n${hint}`)) return;
      try {
        await clearCookbook(id);
        const idx = cookbooks.findIndex(c => c.id === id);
        if (idx >= 0) cookbooks[idx] = { ...cookbooks[idx], recipeCount: 0 };
        showToast(`Kochbuch „${cb.name}" geleert.`, 'success');
        renderList();
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
    } else if (action === 'assign') {
      await openAssignModal(id);
    } else if (action === 'export') {
      await exportCookbookPDF(id);
    }
  });

  renderList();
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
