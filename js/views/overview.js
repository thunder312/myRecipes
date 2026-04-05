import { getAllRecipes, deleteRecipe, getAllCookbooks, assignRecipesToCookbook, getCookbookMemberships } from '../db.js';
import { $, createElement, formatDate, debounce, showToast, categoryChipClass } from '../utils/helpers.js';
import { isAuthenticated } from '../utils/auth.js';
import { t, getCategoryList, translateCategory } from '../i18n.js';

// Persists filter state across navigations (module is cached by ES module system)
let filterState = {
  search: '',
  category: null,  // null = alle Kategorien
  origin: '__all',
  cookbookId: 0,
  sort: 'alpha',
};

export async function render(container) {
  let recipes = await getAllRecipes();
  const canEdit = isAuthenticated();
  let cookbooks = await getAllCookbooks();
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

  const sortOptions = [
    { value: 'alpha', label: t('overview.sortAlpha') },
    { value: 'newest', label: t('overview.sortNewest') },
    { value: 'lastCooked', label: t('overview.sortLastCooked') },
    { value: 'mostCooked', label: t('overview.sortMostCooked') },
  ];
  const categoryList = getCategoryList();
  const allCatLabel = t('overview.allCategories');

  function buildCategoryChips() {
    const chips = [{ value: null, label: allCatLabel, chipClass: 'chip--neutral' }];
    categoryList.forEach(cat => {
      chips.push({ value: cat, label: cat, chipClass: categoryChipClass(translateCategory(cat, 'de')) });
    });
    return chips.map(({ value, label, chipClass }) => {
      const isActive = filterState.category === value;
      return `<button class="chip chip--filter ${chipClass}${isActive ? ' chip--filter-active' : ''}" data-cat="${value === null ? '' : esc(value)}">${esc(label)}</button>`;
    }).join('');
  }

  container.innerHTML = `
    <div class="overview">
      <div class="overview__header">
        <h1>${t('overview.title')} <span class="badge" id="recipeCount">${recipes.length}</span></h1>
        ${canEdit ? `<button class="btn btn--ghost" id="btnToggleSelect"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> ${t('overview.selectBtn')}</button>` : ''}
      </div>
      <div class="overview__filters">
        <input type="text" id="searchInput" class="input" placeholder="${t('overview.searchPlaceholder')}" value="${esc(filterState.search)}" />
        <select id="originFilter" class="select">
          <option value="__all">${t('overview.allOrigins')}</option>
        </select>
        <select id="cookbookFilter" class="select">
          <option value="0">${t('overview.allCookbooks')}</option>
          ${cookbooks.map(cb => `<option value="${cb.id}">${esc(cb.name)}</option>`).join('')}
        </select>
        <select id="sortSelect" class="select">
          ${sortOptions.map(s => `<option value="${s.value}"${filterState.sort === s.value ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="category-chips-bar" id="categoryChipsBar">${buildCategoryChips()}</div>
      <div class="recipe-list" id="recipeGrid"></div>
      <div class="empty-state hidden" id="emptyState">
        <div class="empty-state__icon">📖</div>
        <p id="emptyMsg">${t('overview.empty')}</p>
        <a href="#import" class="btn btn--primary" id="emptyImportLink">${t('import.btnUrl')}</a>
      </div>
      ${canEdit ? `
      <div class="bulk-bar hidden" id="bulkBar">
        <div class="bulk-bar__info">
          <button class="btn btn--ghost btn--sm" id="btnSelectAll">${t('overview.selectAll')}</button>
          <span id="bulkCount">0</span>
        </div>
        <div class="bulk-bar__actions">
          <button class="btn btn--ghost btn--sm" id="btnCancelSelect">${t('overview.cancelBtn')}</button>
          <button class="btn btn--secondary btn--sm" id="btnBulkAssign">${t('overview.assignCookbook')}</button>
          <button class="btn btn--danger btn--sm" id="btnBulkDelete">${t('overview.deleteSelected')}</button>
        </div>
      </div>
      <div class="modal hidden" id="assignCookbookModal">
        <div class="modal__backdrop" id="assignCookbookBackdrop"></div>
        <div class="modal__box">
          <h2>${t('overview.chooseCookbook')}</h2>
          <div class="assign-list" id="assignCookbookList"></div>
          <div class="modal__actions">
            <button class="btn btn--primary" id="btnConfirmCookbookAssign">${t('overview.assignBtn')}</button>
            <button class="btn btn--ghost" id="btnCancelCookbookAssign">${t('overview.cancelBtn')}</button>
          </div>
        </div>
      </div>` : ''}
    </div>
  `;

  const origins = [...new Set(recipes.map(r => r.origin).filter(Boolean))].sort();
  const originSelect = $('#originFilter', container);
  origins.forEach(o => {
    const opt = createElement('option', { value: o, textContent: o });
    if (filterState.origin === o) opt.selected = true;
    originSelect.appendChild(opt);
  });

  // Restore cookbookFilter state
  const cookbookSelect = $('#cookbookFilter', container);
  cookbookSelect.value = String(filterState.cookbookId);

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
        $('#emptyMsg', container).textContent = t('overview.searchPlaceholder').replace('…', '');
        $('#emptyImportLink', container)?.remove();
      }
      return;
    }
    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(recipe => {
      const row = document.createElement('div');
      row.className = 'recipe-row' + (selectMode ? ' recipe-row--selectable' : '') + (selected.has(recipe.id) ? ' recipe-row--selected' : '');
      row.dataset.id = recipe.id;

      const displayCat = translateCategory(recipe.category);

      row.innerHTML = `
        ${selectMode ? `<div class="recipe-row__checkbox"><input type="checkbox" ${selected.has(recipe.id) ? 'checked' : ''} /></div>` : ''}
        <div class="recipe-row__title">${esc(recipe.title)}</div>
        <div class="recipe-row__chips">
          ${recipe.category ? `<span class="chip ${categoryChipClass(recipe.category)}">${esc(displayCat)}</span>` : ''}
          ${recipe.origin ? `<span class="chip chip--origin">${esc(recipe.origin)}</span>` : ''}
        </div>
        ${recipe.prepTime ? `<div class="recipe-row__time">${t('detail.minutes', recipe.prepTime)}</div>` : '<div class="recipe-row__time"></div>'}
        <div class="recipe-row__cooked">${recipe.cookedCount ? `${recipe.cookedCount}×` : '–'}</div>
      `;

      if (selectMode) {
        row.addEventListener('click', (e) => { e.preventDefault(); toggleSelect(recipe.id); });
      } else {
        row.addEventListener('click', () => { window.location.hash = `#detail/${recipe.id}`; });
        row.style.cursor = 'pointer';
      }
      grid.appendChild(row);
    });
  }

  function toggleSelect(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    updateBulkUI();
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
    $('#bulkCount', container).textContent = String(selected.size);
    $('#btnBulkDelete', container).disabled = selected.size === 0;
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
    const origin = $('#originFilter', container).value;
    const cookbookId = parseInt($('#cookbookFilter', container).value, 10);
    const sort = $('#sortSelect', container).value;

    // Persist state
    filterState.search = $('#searchInput', container).value || '';
    filterState.origin = origin;
    filterState.cookbookId = cookbookId;
    filterState.sort = sort;

    let filtered = recipes.filter(r => {
      if (filterState.category !== null && translateCategory(r.category) !== filterState.category) return false;
      if (origin !== '__all' && r.origin !== origin) return false;
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

  $('#searchInput', container).addEventListener('input', debounce(applyFilters));
  $('#originFilter', container).addEventListener('change', applyFilters);
  $('#cookbookFilter', container).addEventListener('change', applyFilters);
  $('#sortSelect', container).addEventListener('change', applyFilters);

  // Category chip clicks
  $('#categoryChipsBar', container).addEventListener('click', e => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    const val = chip.dataset.cat;
    filterState.category = val === '' ? null : val;
    // Update active state on chips
    $('#categoryChipsBar', container).querySelectorAll('[data-cat]').forEach(c => {
      c.classList.toggle('chip--filter-active', c.dataset.cat === (filterState.category === null ? '' : filterState.category));
    });
    applyFilters();
  });

  if (canEdit) {
    $('#btnToggleSelect', container).addEventListener('click', enterSelectMode);
    $('#btnCancelSelect', container).addEventListener('click', exitSelectMode);

    $('#btnSelectAll', container).addEventListener('click', () => {
      const allSelected = currentFiltered.every(r => selected.has(r.id));
      if (allSelected) currentFiltered.forEach(r => selected.delete(r.id));
      else currentFiltered.forEach(r => selected.add(r.id));
      updateBulkUI();
      applyFilters();
    });

    $('#btnBulkAssign', container).addEventListener('click', () => {
      if (selected.size === 0) { showToast(t('overview.noneSelected'), 'warning'); return; }
      const list = $('#assignCookbookList', container);
      list.innerHTML = cookbooks.map(cb => `
        <label class="assign-item">
          <input type="radio" name="assignCookbook" value="${cb.id}" ${cb.id === 1 ? 'checked' : ''} />
          <span class="assign-item__title">${esc(cb.name)}</span>
          ${cb.description ? `<span class="assign-item__sub">${esc(cb.description)}</span>` : ''}
        </label>
      `).join('');
      $('#assignCookbookModal', container).classList.remove('hidden');
    });

    $('#btnConfirmCookbookAssign', container).addEventListener('click', async () => {
      const radio = container.querySelector('input[name="assignCookbook"]:checked');
      if (!radio) { showToast(t('overview.chooseCookbook'), 'warning'); return; }
      const cbId = parseInt(radio.value, 10);
      const recipeIds = Array.from(selected);
      try {
        await assignRecipesToCookbook(recipeIds, cbId);
        await refreshMemberships();
        const cb = cookbooks.find(c => c.id === cbId);
        showToast(t('overview.assigned', recipeIds.length, cb?.name || ''), 'success');
        $('#assignCookbookModal', container).classList.add('hidden');
        exitSelectMode();
      } catch (err) {
        showToast(t('overview.assignError'), 'error');
      }
    });

    $('#btnCancelCookbookAssign', container).addEventListener('click', () => $('#assignCookbookModal', container).classList.add('hidden'));
    $('#assignCookbookBackdrop', container).addEventListener('click', () => $('#assignCookbookModal', container).classList.add('hidden'));

    $('#btnBulkDelete', container).addEventListener('click', async () => {
      const count = selected.size;
      if (count === 0) return;
      if (!confirm(t('overview.deleteConfirm', count))) return;
      let deleted = 0;
      for (const id of selected) { await deleteRecipe(id); deleted++; }
      showToast(t('overview.deleted', deleted), 'info');
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
