import { getAllRecipes } from '../db.js';
import { $, createElement, formatDate, debounce } from '../utils/helpers.js';

const CATEGORIES = ['Alle', 'Vorspeise', 'Hauptspeise', 'Nachspeise', 'Fingerfood', 'Suppe', 'Salat', 'Beilage', 'Getränk', 'Snack', 'Brot/Gebäck'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'alpha', label: 'Alphabetisch' },
  { value: 'lastCooked', label: 'Zuletzt gekocht' },
  { value: 'mostCooked', label: 'Am häufigsten gekocht' }
];

export async function render(container) {
  const recipes = await getAllRecipes();

  container.innerHTML = `
    <div class="overview">
      <div class="overview__header">
        <h1>Meine Rezepte <span class="badge" id="recipeCount">${recipes.length}</span></h1>
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

  function renderCards(filtered) {
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
      const card = createElement('a', {
        className: 'recipe-card',
        href: `#detail/${recipe.id}`
      }, [
        createElement('div', { className: 'recipe-card__body' }, [
          createElement('h3', { className: 'recipe-card__title', textContent: recipe.title }),
          createElement('div', { className: 'recipe-card__meta' }, [
            recipe.category ? createElement('span', { className: 'chip chip--category', textContent: recipe.category }) : null,
            recipe.origin ? createElement('span', { className: 'chip chip--origin', textContent: recipe.origin }) : null,
            recipe.prepTime ? createElement('span', { className: 'chip chip--time', textContent: `${recipe.prepTime} Min.` }) : null
          ].filter(Boolean)),
          createElement('p', { className: 'recipe-card__desc', textContent: recipe.description || '' }),
          createElement('div', { className: 'recipe-card__footer' }, [
            createElement('span', { className: 'recipe-card__cooked', textContent: recipe.cookedCount ? `${recipe.cookedCount}× gekocht` : 'Noch nie gekocht' }),
            recipe.cookedDates?.length
              ? createElement('span', { className: 'recipe-card__date', textContent: `Zuletzt: ${formatDate(recipe.cookedDates[recipe.cookedDates.length - 1])}` })
              : null
          ].filter(Boolean))
        ])
      ]);
      grid.appendChild(card);
    });
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

  $('#searchInput', container).addEventListener('input', debounce(applyFilters));
  $('#categoryFilter', container).addEventListener('change', applyFilters);
  $('#originFilter', container).addEventListener('change', applyFilters);
  $('#sortSelect', container).addEventListener('change', applyFilters);

  applyFilters();
}
