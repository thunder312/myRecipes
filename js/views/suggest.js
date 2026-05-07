import { getAllRecipes, getSavedQueries, addSavedQuery, deleteSavedQuery, getWeekPlan, saveWeekPlan, getWeekShoppingList, saveWeekShoppingList } from '../db.js';
import { getSetting } from '../db.js';
import { suggestRecipes, resolveSlashIngredients } from '../api.js';
import { $, createElement, showToast, categoryChipClass, debounce } from '../utils/helpers.js';
import { isAuthenticated, isAdmin } from '../utils/auth.js';
import { t, tRaw, translateCategory } from '../i18n.js';
import { aggregateIngredients } from '../utils/ingredient-aggregator.js';

const STORE_COLORS = [
  '#e11d48', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export async function render(container, initialTab) {
  const loggedIn = isAuthenticated();
  const admin = isAdmin();

  container.innerHTML = `
    <div class="suggest">
      <div class="suggest__tabs">
        <button class="suggest__tab suggest__tab--active" data-tab="daily">${t('suggest.tabSuggest')}</button>
        <button class="suggest__tab" data-tab="week">${t('suggest.tabWeekPlan')}</button>
      </div>

      <!-- Tab: Tagesvorschlag -->
      <div class="suggest__panel suggest__panel--active" id="panelDaily">
        <h1>${t('suggest.title')}</h1>
        <p class="suggest__intro">${t('suggest.intro')}</p>
        <div class="suggest__input-group">
          <textarea id="questionInput" class="input input--textarea" rows="2" placeholder="${t('suggest.placeholder')}"></textarea>
          <div class="suggest__filters">
            <label class="suggest__filter-check"><input type="checkbox" id="filterHauptgericht" checked /> ${t('suggest.filterMain')}</label>
            <label class="suggest__filter-check"><input type="checkbox" id="filterSalat" checked /> ${t('suggest.filterSalad')}</label>
            ${loggedIn ? `<label class="suggest__filter-check suggest__filter-save"><input type="checkbox" id="saveQuery" /> ${t('suggest.filterSave')}</label>` : ''}
          </div>
          <button class="btn btn--primary" id="btnAsk">${t('suggest.askBtn')}</button>
        </div>
        <div class="suggest__chips" id="savedChips"></div>
        <div class="suggest__loading hidden" id="loading">
          <div class="spinner"></div>
          <p>${t('suggest.loading')}</p>
        </div>
        <div class="suggest__results hidden" id="results"></div>
      </div>

      <!-- Tab: Wochenplan -->
      <div class="suggest__panel" id="panelWeek">
        <h1>${t('suggest.weekPlanTitle')}</h1>
        <p class="suggest__intro">${t('suggest.weekPlanIntro')}</p>
        <div class="week-plan" id="weekPlanGrid"></div>
        <div class="week-plan__footer">
          <button class="btn btn--ghost" id="btnClearPlan">${t('suggest.clearPlan')}</button>
          <button class="btn btn--secondary" id="btnFillAllAi">${t('suggest.fillAllAi')}</button>
          <button class="btn btn--primary" id="btnGenerateList">${t('suggest.generateList')}</button>
          <a href="#week-shopping" class="btn btn--secondary hidden" id="btnGoToList">${t('suggest.listExists')}</a>
        </div>
      </div>
    </div>
  `;

  // --- Tab switching ---
  function activateTab(tabName) {
    container.querySelectorAll('.suggest__tab').forEach(t => t.classList.remove('suggest__tab--active'));
    container.querySelectorAll('.suggest__panel').forEach(p => p.classList.remove('suggest__panel--active'));
    const tab = container.querySelector(`.suggest__tab[data-tab="${tabName}"]`);
    if (tab) tab.classList.add('suggest__tab--active');
    const panel = $('#panel' + tabName.charAt(0).toUpperCase() + tabName.slice(1), container);
    if (panel) panel.classList.add('suggest__panel--active');
  }

  container.querySelectorAll('.suggest__tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  if (initialTab) activateTab(initialTab);

  // =========================================================================
  // Tab: Tagesvorschlag (existing logic)
  // =========================================================================

  const questionInput = $('#questionInput', container);
  const btnAsk = $('#btnAsk', container);
  const loading = $('#loading', container);
  const results = $('#results', container);
  const savedChips = $('#savedChips', container);

  async function renderChips() {
    savedChips.innerHTML = '';
    let queries = [];
    try { queries = await getSavedQueries(); } catch { /* ignore */ }
    queries.forEach(q => {
      const chip = createElement('button', { className: 'chip chip--clickable', textContent: q.question });
      chip.addEventListener('click', () => { questionInput.value = q.question; performSearch(); });
      if (admin) {
        const del = createElement('button', { className: 'chip__delete', innerHTML: '&times;' });
        del.addEventListener('click', async (e) => { e.stopPropagation(); await deleteSavedQuery(q.id); renderChips(); });
        chip.appendChild(del);
      }
      savedChips.appendChild(chip);
    });
  }
  await renderChips();

  btnAsk.addEventListener('click', performSearch);
  questionInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); performSearch(); } });

  async function performSearch() {
    const question = questionInput.value.trim();
    if (!question) { showToast(t('suggest.noQuestion'), 'warning'); return; }
    const apiKey = await getSetting('apiKey');
    if (!apiKey) { showToast(t('suggest.noApiKey'), 'warning'); return; }
    const allRecipes = await getAllRecipes();
    if (allRecipes.length === 0) { showToast(t('suggest.noRecipes'), 'warning'); return; }
    const hauptOnly = $('#filterHauptgericht', container).checked;
    const includeSalat = $('#filterSalat', container).checked;
    let recipes = allRecipes;
    if (hauptOnly) {
      recipes = allRecipes.filter(r => {
        const cat = r.category || '';
        if (cat === 'Hauptspeise' || cat === 'Main Course') return true;
        if (includeSalat && (cat === 'Salat' || cat === 'Salad')) return true;
        return false;
      });
      if (recipes.length === 0) { showToast(t('suggest.noCategory'), 'warning'); return; }
    }
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    btnAsk.disabled = true;
    try {
      const suggestions = await suggestRecipes(question, recipes);
      const saveCheckbox = $('#saveQuery', container);
      if (saveCheckbox && saveCheckbox.checked) {
        await addSavedQuery(question);
        saveCheckbox.checked = false;
        await renderChips();
      }
      renderResults(suggestions, allRecipes);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading.classList.add('hidden');
      btnAsk.disabled = false;
    }
  }

  function renderResults(suggestions, allRecipes) {
    results.innerHTML = '';
    results.classList.remove('hidden');
    if (!suggestions || suggestions.length === 0) {
      results.innerHTML = `<p class="suggest__no-results">${t('suggest.noMatch')}</p>`;
      return;
    }
    const heading = createElement('h2', { textContent: t('suggest.results', suggestions.length) });
    results.appendChild(heading);
    suggestions.forEach((suggestion, index) => {
      const recipe = allRecipes.find(r => r.id === suggestion.id);
      if (!recipe) return;
      const displayCat = translateCategory(recipe.category);
      const card = createElement('div', { className: 'suggest-card' }, [
        createElement('div', { className: 'suggest-card__rank', textContent: `#${index + 1}` }),
        createElement('div', { className: 'suggest-card__body' }, [
          createElement('a', { href: `#detail/${recipe.id}`, className: 'suggest-card__title' }, [recipe.title]),
          createElement('div', { className: 'suggest-card__meta' }, [
            recipe.category ? createElement('span', { className: `chip ${categoryChipClass(recipe.category)}`, textContent: displayCat }) : null,
            recipe.origin ? createElement('span', { className: 'chip chip--origin', textContent: recipe.origin }) : null,
            recipe.prepTime ? createElement('span', { className: 'chip chip--time', textContent: t('detail.minutes', recipe.prepTime) }) : null,
          ].filter(Boolean)),
          createElement('div', { className: 'suggest-card__reasons' }, [
            createElement('strong', { textContent: t('suggest.why') + ': ' }),
            ...suggestion.matchReasons.map(reason => createElement('span', { className: 'chip chip--reason', textContent: reason })),
          ]),
          recipe.cookedCount
            ? createElement('small', { className: 'suggest-card__stats', textContent: t('suggest.cookedCount', recipe.cookedCount) })
            : createElement('small', { className: 'suggest-card__stats', textContent: t('suggest.cookedNever') }),
        ]),
      ]);
      results.appendChild(card);
    });
  }

  // =========================================================================
  // Tab: Wochenplan
  // =========================================================================

  let allRecipes = [];
  let slots = [null, null, null, null, null, null, null]; // Mon–Sun, each is recipeId or null
  let shoppingListExists = false;

  try {
    [allRecipes] = await Promise.all([getAllRecipes()]);
    const plan = await getWeekPlan();
    // plan.slots is an array of recipeIds (or null), length may vary
    if (Array.isArray(plan.slots)) {
      plan.slots.forEach((id, i) => { if (i < 7) slots[i] = id || null; });
    }
    const existingList = await getWeekShoppingList();
    shoppingListExists = !!existingList;
  } catch { /* ignore */ }

  const days = tRaw('suggest.days') || ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const btnGoToList = $('#btnGoToList', container);
  if (shoppingListExists) btnGoToList.classList.remove('hidden');

  function recipeById(id) {
    return allRecipes.find(r => r.id === id) || null;
  }

  function renderWeekGrid() {
    const grid = $('#weekPlanGrid', container);
    grid.innerHTML = '';
    days.forEach((dayName, i) => {
      const recipe = recipeById(slots[i]);
      const filled = !!recipe;
      const card = document.createElement('div');
      card.className = 'week-plan__day' + (filled ? ' week-plan__day--filled' : '');
      card.dataset.day = i;
      card.innerHTML = `
        <div class="week-plan__day-name">${dayName}</div>
        <div class="week-plan__recipe-name${filled ? '' : ' week-plan__recipe-name--empty'}">
          ${filled ? esc(recipe.title) : t('suggest.dayEmpty')}
        </div>
        <div class="week-plan__actions">
          <button class="week-plan__icon-btn" data-action="pick" data-day="${i}" title="${t('suggest.pickRecipe')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <button class="week-plan__icon-btn" data-action="ai" data-day="${i}" title="${t('suggest.aiSuggest')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
          </button>
          ${filled ? `<button class="week-plan__icon-btn week-plan__icon-btn--remove" data-action="remove" data-day="${i}" title="${t('suggest.removeDay')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  }
  renderWeekGrid();

  async function persistSlots() {
    try { await saveWeekPlan([...slots]); } catch { /* ignore */ }
  }

  // Delegate click events on the week grid
  $('#weekPlanGrid', container).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const day = parseInt(btn.dataset.day, 10);
    const action = btn.dataset.action;

    if (action === 'remove') {
      slots[day] = null;
      renderWeekGrid();
      await persistSlots();
    } else if (action === 'pick') {
      openRecipePicker(day);
    } else if (action === 'ai') {
      try {
        await runAiSuggest(day, btn);
      } catch (err) {
        showToast(err?.message || String(err) || t('common.error'), 'error');
      }
    }
  });

  function openRecipePicker(dayIndex) {
    const existing = document.getElementById('recipePickerModal');
    if (existing) existing.remove();

    const alreadyUsed = new Set(slots.filter(Boolean));

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'recipePickerModal';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__box">
        <div class="modal__header">
          <h2>${t('suggest.recipePickerTitle')}</h2>
          <button class="modal__close" id="pickerClose" aria-label="${t('common.close')}">&times;</button>
        </div>
        <div class="modal__body">
          <div class="recipe-picker">
            <div class="recipe-picker__search">
              <input type="text" class="input" id="pickerSearch" placeholder="${t('suggest.recipePickerSearch')}" />
            </div>
            <div class="recipe-picker__list" id="pickerList"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function renderPickerList(query) {
      const list = modal.querySelector('#pickerList');
      const filtered = allRecipes.filter(r =>
        !query || r.title.toLowerCase().includes(query.toLowerCase())
      );
      if (filtered.length === 0) {
        list.innerHTML = `<p class="suggest__no-results">${t('suggest.recipePickerEmpty')}</p>`;
        return;
      }
      list.innerHTML = '';
      filtered.forEach(r => {
        const used = alreadyUsed.has(r.id);
        const item = document.createElement('button');
        item.className = 'recipe-picker__item' + (used ? ' recipe-picker__item--used' : '');
        item.innerHTML = `
          <span class="recipe-picker__item-name">${esc(r.title)}</span>
          ${r.category ? `<span class="chip ${categoryChipClass(r.category)} chip--xs">${esc(translateCategory(r.category))}</span>` : ''}
          ${used ? '<span class="chip chip--neutral chip--xs">✓</span>' : ''}
        `;
        item.addEventListener('click', async () => {
          slots[dayIndex] = r.id;
          modal.remove();
          renderWeekGrid();
          await persistSlots();
        });
        list.appendChild(item);
      });
    }

    renderPickerList('');
    modal.querySelector('#pickerSearch').addEventListener('input', (e) => renderPickerList(e.target.value));
    modal.querySelector('#pickerClose').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal__backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#pickerSearch').focus();
  }

  async function runAiSuggest(dayIndex, btn) {
    const apiKey = await getSetting('apiKey');
    if (!apiKey) { showToast(t('suggest.noApiKey'), 'warning'); return; }
    if (allRecipes.length === 0) { showToast(t('suggest.noRecipes'), 'warning'); return; }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('suggest.aiSuggestLoading');

    const usedIds = new Set(slots.filter(Boolean));
    const candidates = allRecipes.filter(r => !usedIds.has(r.id));
    if (candidates.length === 0) { showToast(t('suggest.noMatch'), 'warning'); btn.disabled = false; btn.textContent = originalText; return; }

    try {
      const dayName = days[dayIndex];
      const suggestions = await suggestRecipes(`Was soll ich am ${dayName} kochen?`, candidates);
      if (suggestions && suggestions.length > 0) {
        const top = suggestions[0];
        const recipe = allRecipes.find(r => r.id === top.id || String(r.id) === String(top.id));
        if (!recipe) { showToast(t('suggest.noMatch'), 'warning'); return; }
        btn.disabled = false;
        btn.textContent = originalText;
        await showAiSuggestionModal(dayName, recipe, top.matchReasons || [], () => {
          slots[dayIndex] = recipe.id;
          renderWeekGrid();
          persistSlots();
        });
      } else {
        showToast(t('suggest.noMatch'), 'warning');
      }
    } catch (err) {
      showToast(err?.message || String(err) || t('common.error'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function showAiSuggestionModal(dayName, recipe, reasons, onAccept) {
    return new Promise(resolve => {
      const existing = document.getElementById('aiSuggestModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'aiSuggestModal';
      modal.innerHTML = `
        <div class="modal__backdrop"></div>
        <div class="modal__box">
          <div class="modal__header">
            <h2>${t('suggest.aiSuggestModalTitle', dayName)}</h2>
            <button class="modal__close" id="aiSuggestClose" aria-label="${t('common.close')}">&times;</button>
          </div>
          <div class="modal__body">
            <p class="ai-suggest-modal__recipe">${esc(recipe.title)}</p>
            ${reasons.length ? `
              <ul class="ai-suggest-modal__reasons">
                ${reasons.map(r => `<li>${esc(r)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
          <div class="modal__footer">
            <button class="btn btn--ghost" id="aiSuggestCancel">${t('common.cancel')}</button>
            <button class="btn btn--primary" id="aiSuggestAccept">${t('suggest.aiSuggestAccept')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { modal.remove(); resolve(); };
      modal.querySelector('#aiSuggestClose').addEventListener('click', close);
      modal.querySelector('.modal__backdrop').addEventListener('click', close);
      modal.querySelector('#aiSuggestCancel').addEventListener('click', close);
      modal.querySelector('#aiSuggestAccept').addEventListener('click', () => {
        modal.remove();
        onAccept();
        resolve();
      });
    });
  }

  // Clear week plan
  $('#btnClearPlan', container).addEventListener('click', async () => {
    slots = [null, null, null, null, null, null, null];
    renderWeekGrid();
    await persistSlots();
    showToast(t('suggest.planCleared'), 'success');
  });

  // Fill all days with AI
  $('#btnFillAllAi', container).addEventListener('click', async () => {
    const apiKey = await getSetting('apiKey');
    if (!apiKey) { showToast(t('suggest.noApiKey'), 'warning'); return; }
    if (allRecipes.length === 0) { showToast(t('suggest.noRecipes'), 'warning'); return; }

    const btn = $('#btnFillAllAi', container);
    const clearBtn = $('#btnClearPlan', container);
    btn.disabled = true;
    clearBtn.disabled = true;
    const originalLabel = btn.textContent;

    const emptyIndices = slots.map((s, i) => i).filter(i => !slots[i]);

    for (let idx = 0; idx < emptyIndices.length; idx++) {
      const dayIndex = emptyIndices[idx];
      btn.textContent = `${t('suggest.fillAllAiLoading')} ${idx + 1}/${emptyIndices.length}…`;

      const usedIds = new Set(slots.filter(Boolean));
      const candidates = allRecipes.filter(r => !usedIds.has(r.id));
      if (candidates.length === 0) break;

      try {
        const dayName = days[dayIndex];
        const suggestions = await suggestRecipes(`Was soll ich am ${dayName} kochen?`, candidates);
        if (suggestions && suggestions.length > 0) {
          const top = suggestions[0];
          const recipe = allRecipes.find(r => r.id === top.id || String(r.id) === String(top.id));
          if (recipe) {
            slots[dayIndex] = recipe.id;
            renderWeekGrid();
          }
        }
      } catch { /* skip day on error */ }
    }

    await persistSlots();
    btn.disabled = false;
    btn.textContent = originalLabel;
    clearBtn.disabled = false;
    showToast(t('suggest.fillAllAiDone'), 'success');
  });

  // Generate shopping list
  $('#btnGenerateList', container).addEventListener('click', async () => {
    const planned = slots.map((id, i) => ({ recipeId: id, day: i })).filter(s => s.recipeId);
    if (planned.length === 0) { showToast(t('suggest.noDaySelected'), 'warning'); return; }

    const recipePlans = planned.map(s => ({ recipe: recipeById(s.recipeId) })).filter(p => p.recipe);
    let items = aggregateIngredients(recipePlans);

    // Resolve "A/B/C" ingredient names into separate items
    try {
      const slashIdxs = items.reduce((acc, item, i) => { if (item.name.includes('/')) acc.push(i); return acc; }, []);
      if (slashIdxs.length > 0) {
        const resolved = await resolveSlashIngredients(slashIdxs.map(i => items[i].name));
        for (let ri = slashIdxs.length - 1; ri >= 0; ri--) {
          const parts = resolved[ri];
          if (!Array.isArray(parts)) continue;
          const original = items.splice(slashIdxs[ri], 1)[0];
          for (const partName of parts) {
            const name = partName.trim();
            if (!name) continue;
            const existing = items.find(it => it.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              (original.recipes || []).forEach(r => { if (!existing.recipes?.includes(r)) existing.recipes?.push(r); });
            } else {
              items.push({ id: `${Date.now()}-${Math.random()}`, name, amount: original.amount || '',
                recipes: [...(original.recipes || [])], checked: false, storeId: original.storeId || null });
            }
          }
        }
      }
    } catch { /* ignore – slash resolution is best-effort */ }

    // Apply existing product tag suggestions if available
    try {
      const { getAllStores, getProductTags } = await import('../db.js');
      const [stores, tags] = await Promise.all([getAllStores(), getProductTags()]);
      const tagMap = new Map(tags.map(t => [t.productName, t.storeId]));
      items.forEach(item => {
        const key = item.name.toLowerCase().trim();
        if (tagMap.has(key)) item.storeId = tagMap.get(key);
      });
    } catch { /* ignore – product tags are optional */ }

    try {
      await saveWeekShoppingList(items, []);
      showToast(t('suggest.listGenerated'), 'success');
      btnGoToList.classList.remove('hidden');
      shoppingListExists = true;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
