import { getAllRecipes, deleteRecipe } from '../db.js';
import { $, createElement, formatDate, debounce, showToast } from '../utils/helpers.js';
import { isAuthenticated } from '../utils/auth.js';

const CATEGORIES = ['Alle', 'Vorspeise', 'Hauptspeise', 'Nachspeise', 'Fingerfood', 'Suppe', 'Salat', 'Beilage', 'Getränk', 'Snack', 'Brot/Gebäck'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'alpha', label: 'Alphabetisch' },
  { value: 'lastCooked', label: 'Zuletzt gekocht' },
  { value: 'mostCooked', label: 'Am häufigsten gekocht' }
];

export async function render(container) {
  let recipes = await getAllRecipes();
  const canEdit = isAuthenticated();
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
        <select id="sortSelect" class="select">
          ${SORT_OPTIONS.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="recipe-grid" id="recipeGrid"></div>
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
          <button class="btn btn--danger btn--sm" id="btnBulkDelete">Ausgewählte löschen</button>
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
      const card = document.createElement('div');
      card.className = 'recipe-card' + (selectMode ? ' recipe-card--selectable' : '') + (selected.has(recipe.id) ? ' recipe-card--selected' : '');
      card.dataset.id = recipe.id;

      card.innerHTML = `
        ${selectMode ? `<div class="recipe-card__checkbox"><input type="checkbox" ${selected.has(recipe.id) ? 'checked' : ''} /></div>` : ''}
        <div class="recipe-card__body">
          <h3 class="recipe-card__title">${esc(recipe.title)}</h3>
          <div class="recipe-card__meta">
            ${recipe.category ? `<span class="chip chip--category">${esc(recipe.category)}</span>` : ''}
            ${recipe.origin ? `<span class="chip chip--origin">${esc(recipe.origin)}</span>` : ''}
            ${recipe.prepTime ? `<span class="chip chip--time">${recipe.prepTime} Min.</span>` : ''}
          </div>
          <p class="recipe-card__desc">${esc(recipe.description || '')}</p>
          <div class="recipe-card__footer">
            <span class="recipe-card__cooked">${recipe.cookedCount ? `${recipe.cookedCount}× gekocht` : 'Noch nie gekocht'}</span>
            ${recipe.cookedDates?.length ? `<span class="recipe-card__date">Zuletzt: ${formatDate(recipe.cookedDates[recipe.cookedDates.length - 1])}</span>` : ''}
          </div>
        </div>
      `;

      if (selectMode) {
        card.addEventListener('click', (e) => {
          e.preventDefault();
          toggleSelect(recipe.id);
        });
      } else {
        card.addEventListener('click', () => {
          window.location.hash = `#detail/${recipe.id}`;
        });
        card.style.cursor = 'pointer';
      }

      grid.appendChild(card);
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
    const card = grid.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.toggle('recipe-card--selected', selected.has(id));
      const cb = card.querySelector('input[type="checkbox"]');
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
    const sort = $('#sortSelect', container).value;

    let filtered = recipes.filter(r => {
      if (category !== 'Alle' && r.category !== category) return false;
      if (origin !== 'Alle' && r.origin !== origin) return false;
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
