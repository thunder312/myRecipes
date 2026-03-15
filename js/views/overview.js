import { getAllRecipes, deleteRecipe, getAllCookbooks, assignRecipesToCookbook, getCookbookMemberships } from '../db.js';
import { $, createElement, formatDate, debounce, showToast, categoryChipClass } from '../utils/helpers.js';
import { isAuthenticated } from '../utils/auth.js';

const CATEGORIES = ['Alle', 'Vorspeise', 'Hauptspeise', 'Nachspeise', 'Fingerfood', 'Suppe', 'Salat', 'Beilage', 'Getränk', 'Snack', 'Brot/Gebäck', 'Gewürzmischungen', 'Kuchen', 'Soße', 'Sauerkonserven', 'Wurstrezept'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'alpha', label: 'Alphabetisch' },
  { value: 'lastCooked', label: 'Zuletzt gekocht' },
  { value: 'mostCooked', label: 'Am häufigsten gekocht' }
];

export async function render(container) {
  let recipes = await getAllRecipes();
  const canEdit = isAuthenticated();
  let cookbooks = await getAllCookbooks();
  // Build recipeId -> Set<cookbookId> map for filtering
  let recipeCookbookMap = new Map();
  async function refreshMemberships() {
    const memberships = await getCookbookMemberships();
    recipeCookbookMap = new Map();
    for (const { recipeId, cookbookId } of memberships) {
      if (!recipeCookbookMap.has(recipeId)) recipeCookbookMap.set(recipeId, new Set());
      recipeCookbookMap.get(recipeId).add(cookbookId);
    }
  }
  await refreshMemberships();
  let selectMode = false;
  const selected = new Set();

  container.innerHTML = `
    <div class="overview">
      <div class="overview__header">
        <h1>Meine Rezepte <span class="badge" id="recipeCount">${recipes.length}</span></h1>
        ${canEdit ? '<button class="btn btn--ghost" id="btnToggleSelect"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> Auswählen</button>' : ''}
      </div>
      <div class="overview__filters">
        <input type="text" id="searchInput" class="input" placeholder="Rezept suchen..." />
        <select id="categoryFilter" class="select">
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="originFilter" class="select">
          <option value="Alle">Alle Herkünfte</option>
        </select>
        <select id="cookbookFilter" class="select">
          <option value="0">Alle Kochbücher</option>
          ${cookbooks.map(cb => `<option value="${cb.id}">${esc(cb.name)}</option>`).join('')}
        </select>
        <select id="sortSelect" class="select">
          ${SORT_OPTIONS.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="recipe-list" id="recipeGrid"></div>
      <div class="empty-state hidden" id="emptyState">
        <div class="empty-state__icon">📖</div>
        <p>Noch keine Rezepte vorhanden.</p>
        <a href="#import" class="btn btn--primary">Rezept importieren</a>
      </div>
      ${canEdit ? `
      <div class="bulk-bar hidden" id="bulkBar">
        <div class="bulk-bar__info">
          <button class="btn btn--ghost btn--sm" id="btnSelectAll">Alle auswählen</button>
          <span id="bulkCount">0 ausgewählt</span>
        </div>
        <div class="bulk-bar__actions">
          <button class="btn btn--ghost btn--sm" id="btnCancelSelect">Abbrechen</button>
          <button class="btn btn--secondary btn--sm" id="btnBulkAssign">Kochbuch zuordnen</button>
          <button class="btn btn--danger btn--sm" id="btnBulkDelete">Ausgewählte löschen</button>
        </div>
      </div>
      <!-- Cookbook assign picker -->
      <div class="modal hidden" id="assignCookbookModal">
        <div class="modal__backdrop" id="assignCookbookBackdrop"></div>
        <div class="modal__box">
          <h2>Kochbuch auswählen</h2>
          <p class="settings__hint">Ordne die ausgewählten Rezepte einem Kochbuch zu.</p>
          <div class="assign-list" id="assignCookbookList"></div>
          <div class="modal__actions">
            <button class="btn btn--primary" id="btnConfirmCookbookAssign">Zuordnen</button>
            <button class="btn btn--ghost" id="btnCancelCookbookAssign">Abbrechen</button>
          </div>
        </div>
      </div>` : ''}
    </div>
  `;

  // Populate origin filter
  const origins = [...new Set(recipes.map(r => r.origin).filter(Boolean))].sort();
  const originSelect = $('#originFilter', container);
  origins.forEach(o => {
    originSelect.appendChild(createElement('option', { value: o, textContent: o }));
  });

  const grid = $('#recipeGrid', container);
  const emptyState = $('#emptyState', container);
  let currentFiltered = [];

  function renderCards(filtered) {
    currentFiltered = filtered;
    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.classList.add('hidden');
      emptyState.classList.remove('hidden');
      if (recipes.length > 0) {
        emptyState.querySelector('p').textContent = 'Keine Rezepte gefunden.';
        emptyState.querySelector('a')?.remove();
      }
      return;
    }
    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(recipe => {
      const row = document.createElement('div');
      row.className = 'recipe-row' + (selectMode ? ' recipe-row--selectable' : '') + (selected.has(recipe.id) ? ' recipe-row--selected' : '');
      row.dataset.id = recipe.id;

      row.innerHTML = `
        ${selectMode ? `<div class="recipe-row__checkbox"><input type="checkbox" ${selected.has(recipe.id) ? 'checked' : ''} /></div>` : ''}
        <div class="recipe-row__title">${esc(recipe.title)}</div>
        <div class="recipe-row__chips">
          ${recipe.category ? `<span class="chip ${categoryChipClass(recipe.category)}">${esc(recipe.category)}</span>` : ''}
          ${recipe.origin ? `<span class="chip chip--origin">${esc(recipe.origin)}</span>` : ''}
        </div>
        ${recipe.prepTime ? `<div class="recipe-row__time">${recipe.prepTime} Min.</div>` : '<div class="recipe-row__time"></div>'}
        <div class="recipe-row__cooked">${recipe.cookedCount ? `${recipe.cookedCount}×` : '–'}</div>
      `;

      if (selectMode) {
        row.addEventListener('click', (e) => {
          e.preventDefault();
          toggleSelect(recipe.id);
        });
      } else {
        row.addEventListener('click', () => {
          window.location.hash = `#detail/${recipe.id}`;
        });
        row.style.cursor = 'pointer';
      }

      grid.appendChild(row);
    });
  }

  function toggleSelect(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    updateBulkUI();
    // Update card visual
    const row = grid.querySelector(`[data-id="${id}"]`);
    if (row) {
      row.classList.toggle('recipe-row--selected', selected.has(id));
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = selected.has(id);
    }
  }

  function updateBulkUI() {
    const bulkBar = $('#bulkBar', container);
    if (!bulkBar) return;
    const count = selected.size;
    $('#bulkCount', container).textContent = `${count} ausgewählt`;
    $('#btnBulkDelete', container).disabled = count === 0;
  }

  function enterSelectMode() {
    selectMode = true;
    selected.clear();
    container.querySelector('.overview').classList.add('overview--select-mode');
    $('#bulkBar', container)?.classList.remove('hidden');
    $('#btnToggleSelect', container)?.classList.add('hidden');
    updateBulkUI();
    applyFilters();
  }

  function exitSelectMode() {
    selectMode = false;
    selected.clear();
    container.querySelector('.overview').classList.remove('overview--select-mode');
    $('#bulkBar', container)?.classList.add('hidden');
    $('#btnToggleSelect', container)?.classList.remove('hidden');
    applyFilters();
  }

  function applyFilters() {
    const search = ($('#searchInput', container).value || '').toLowerCase();
    const category = $('#categoryFilter', container).value;
    const origin = $('#originFilter', container).value;
    const cookbookId = parseInt($('#cookbookFilter', container).value, 10);
    const sort = $('#sortSelect', container).value;

    let filtered = recipes.filter(r => {
      if (category !== 'Alle' && r.category !== category) return false;
      if (origin !== 'Alle' && r.origin !== origin) return false;
      if (cookbookId !== 0 && !recipeCookbookMap.get(r.id)?.has(cookbookId)) return false;
      if (search) {
        const haystack = [r.title, r.description, r.mainIngredient, ...(r.tags || []), ...(r.ingredients || [])].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'alpha': return (a.title || '').localeCompare(b.title || '');
        case 'lastCooked': {
          const aDate = a.cookedDates?.length ? a.cookedDates[a.cookedDates.length - 1] : '';
          const bDate = b.cookedDates?.length ? b.cookedDates[b.cookedDates.length - 1] : '';
          return bDate.localeCompare(aDate);
        }
        case 'mostCooked': return (b.cookedCount || 0) - (a.cookedCount || 0);
        default: return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
    });

    renderCards(filtered);
    $('#recipeCount', container).textContent = filtered.length;
  }

  // Filter event listeners
  $('#searchInput', container).addEventListener('input', debounce(applyFilters));
  $('#categoryFilter', container).addEventListener('change', applyFilters);
  $('#originFilter', container).addEventListener('change', applyFilters);
  $('#cookbookFilter', container).addEventListener('change', applyFilters);
  $('#sortSelect', container).addEventListener('change', applyFilters);

  // Bulk-select event listeners
  if (canEdit) {
    $('#btnToggleSelect', container).addEventListener('click', enterSelectMode);
    $('#btnCancelSelect', container).addEventListener('click', exitSelectMode);

    $('#btnSelectAll', container).addEventListener('click', () => {
      const allSelected = currentFiltered.every(r => selected.has(r.id));
      if (allSelected) {
        currentFiltered.forEach(r => selected.delete(r.id));
      } else {
        currentFiltered.forEach(r => selected.add(r.id));
      }
      updateBulkUI();
      applyFilters();
    });

    $('#btnBulkAssign', container).addEventListener('click', () => {
      if (selected.size === 0) { showToast('Bitte erst Rezepte auswählen.', 'warning'); return; }
      const list = $('#assignCookbookList', container);
      list.innerHTML = cookbooks.map(cb => `
        <label class="assign-item">
          <input type="radio" name="assignCookbook" value="${cb.id}" ${cb.id === 1 ? 'checked' : ''} />
          <span class="assign-item__title">${escOv(cb.name)}</span>
          ${cb.description ? `<span class="assign-item__sub">${escOv(cb.description)}</span>` : ''}
        </label>
      `).join('');
      $('#assignCookbookModal', container).classList.remove('hidden');
    });

    $('#btnConfirmCookbookAssign', container).addEventListener('click', async () => {
      const radio = container.querySelector('input[name="assignCookbook"]:checked');
      if (!radio) { showToast('Bitte ein Kochbuch wählen.', 'warning'); return; }
      const cookbookId = parseInt(radio.value, 10);
      const recipeIds = Array.from(selected);
      try {
        await assignRecipesToCookbook(recipeIds, cookbookId);
        await refreshMemberships();
        const cb = cookbooks.find(c => c.id === cookbookId);
        showToast(`${recipeIds.length} Rezept${recipeIds.length !== 1 ? 'e' : ''} dem Kochbuch „${cb?.name}" zugeordnet.`, 'success');
        $('#assignCookbookModal', container).classList.add('hidden');
        exitSelectMode();
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
    });

    $('#btnCancelCookbookAssign', container).addEventListener('click', () => {
      $('#assignCookbookModal', container).classList.add('hidden');
    });
    $('#assignCookbookBackdrop', container).addEventListener('click', () => {
      $('#assignCookbookModal', container).classList.add('hidden');
    });

    $('#btnBulkDelete', container).addEventListener('click', async () => {
      const count = selected.size;
      if (count === 0) return;
      if (!confirm(`${count} Rezept${count > 1 ? 'e' : ''} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;

      let deleted = 0;
      for (const id of selected) {
        await deleteRecipe(id);
        deleted++;
      }

      showToast(`${deleted} Rezept${deleted > 1 ? 'e' : ''} gelöscht.`, 'info');
      recipes = await getAllRecipes();
      exitSelectMode();
    });
  }

  applyFilters();
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escOv(str) {
  return esc(str);
}
