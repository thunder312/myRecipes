import { getAllRecipes, getSavedQueries, addSavedQuery, deleteSavedQuery } from '../db.js';
import { getSetting } from '../db.js';
import { suggestRecipes } from '../api.js';
import { $, createElement, showToast, categoryChipClass } from '../utils/helpers.js';
import { isAuthenticated, isAdmin } from '../utils/auth.js';
import { t, translateCategory } from '../i18n.js';

export async function render(container) {
  const loggedIn = isAuthenticated();
  const admin = isAdmin();

  container.innerHTML = `
    <div class="suggest">
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
  `;

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
      // Match both DE and EN category names
      const mainDE = 'Hauptspeise', mainEN = 'Main Course';
      const salatDE = 'Salat', salatEN = 'Salad';
      recipes = allRecipes.filter(r => {
        const cat = r.category || '';
        if (cat === mainDE || cat === mainEN) return true;
        if (includeSalat && (cat === salatDE || cat === salatEN)) return true;
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
}
