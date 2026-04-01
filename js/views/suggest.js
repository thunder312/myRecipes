import { getAllRecipes, getSavedQueries, addSavedQuery, deleteSavedQuery } from '../db.js';
import { getSetting } from '../db.js';
import { suggestRecipes } from '../api.js';
import { $, createElement, showToast, categoryChipClass } from '../utils/helpers.js';
import { isAuthenticated } from '../utils/auth.js';

export async function render(container) {
  const loggedIn = isAuthenticated();

  container.innerHTML = `
    <div class="suggest">
      <h1>Was koche ich heute?</h1>
      <p class="suggest__intro">Stelle eine Frage und ich schlage dir passende Rezepte vor.</p>

      <div class="suggest__input-group">
        <textarea id="questionInput" class="input input--textarea" rows="2" placeholder="z.B. Was kann ich mit Kartoffeln machen?"></textarea>
        <div class="suggest__filters">
          <label class="suggest__filter-check"><input type="checkbox" id="filterHauptgericht" checked /> Nur Hauptgerichte</label>
          <label class="suggest__filter-check"><input type="checkbox" id="filterSalat" checked /> Salate einschließen</label>
          ${loggedIn ? '<label class="suggest__filter-check suggest__filter-save"><input type="checkbox" id="saveQuery" /> Frage speichern</label>' : ''}
        </div>
        <button class="btn btn--primary" id="btnAsk">Rezepte vorschlagen</button>
      </div>

      <div class="suggest__chips" id="savedChips"></div>

      <div class="suggest__loading hidden" id="loading">
        <div class="spinner"></div>
        <p>Suche passende Rezepte...</p>
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
    try {
      queries = await getSavedQueries();
    } catch { /* ignore */ }

    queries.forEach(q => {
      const chip = createElement('button', {
        className: 'chip chip--clickable',
        textContent: q.question,
      });
      chip.addEventListener('click', () => {
        questionInput.value = q.question;
        performSearch();
      });

      if (loggedIn) {
        const del = createElement('span', {
          className: 'chip__delete',
          title: 'Frage entfernen',
          innerHTML: '&times;',
        });
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteSavedQuery(q.id);
          renderChips();
        });
        chip.appendChild(del);
      }

      savedChips.appendChild(chip);
    });
  }

  await renderChips();

  btnAsk.addEventListener('click', performSearch);
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  });

  async function performSearch() {
    const question = questionInput.value.trim();
    if (!question) {
      showToast('Bitte eine Frage eingeben.', 'warning');
      return;
    }

    const apiKey = await getSetting('apiKey');
    if (!apiKey) {
      showToast('Bitte zuerst den API-Key in den Einstellungen hinterlegen.', 'warning');
      return;
    }

    const allRecipes = await getAllRecipes();
    if (allRecipes.length === 0) {
      showToast('Noch keine Rezepte vorhanden. Importiere zuerst ein Rezept.', 'warning');
      return;
    }

    const hauptOnly = $('#filterHauptgericht', container).checked;
    const includeSalat = $('#filterSalat', container).checked;

    let recipes = allRecipes;
    if (hauptOnly) {
      const allowed = ['Hauptspeise'];
      if (includeSalat) allowed.push('Salat');
      recipes = allRecipes.filter(r => allowed.includes(r.category));

      if (recipes.length === 0) {
        showToast('Keine Rezepte in den gefilterten Kategorien gefunden.', 'warning');
        return;
      }
    }

    loading.classList.remove('hidden');
    results.classList.add('hidden');
    btnAsk.disabled = true;

    try {
      const suggestions = await suggestRecipes(question, recipes);

      // Save query if checkbox is checked
      const saveCheckbox = $('#saveQuery', container);
      if (saveCheckbox && saveCheckbox.checked) {
        await addSavedQuery(question);
        saveCheckbox.checked = false;
        await renderChips();
      }

      renderResults(suggestions, allRecipes);
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    } finally {
      loading.classList.add('hidden');
      btnAsk.disabled = false;
    }
  }

  function renderResults(suggestions, allRecipes) {
    results.innerHTML = '';
    results.classList.remove('hidden');

    if (!suggestions || suggestions.length === 0) {
      results.innerHTML = '<p class="suggest__no-results">Keine passenden Rezepte gefunden.</p>';
      return;
    }

    const heading = createElement('h2', { textContent: `${suggestions.length} Vorschläge gefunden` });
    results.appendChild(heading);

    suggestions.forEach((suggestion, index) => {
      const recipe = allRecipes.find(r => r.id === suggestion.id);
      if (!recipe) return;

      const card = createElement('div', { className: 'suggest-card' }, [
        createElement('div', { className: 'suggest-card__rank', textContent: `#${index + 1}` }),
        createElement('div', { className: 'suggest-card__body' }, [
          createElement('a', {
            href: `#detail/${recipe.id}`,
            className: 'suggest-card__title'
          }, [recipe.title]),
          createElement('div', { className: 'suggest-card__meta' }, [
            recipe.category ? createElement('span', { className: `chip ${categoryChipClass(recipe.category)}`, textContent: recipe.category }) : null,
            recipe.origin ? createElement('span', { className: 'chip chip--origin', textContent: recipe.origin }) : null,
            recipe.prepTime ? createElement('span', { className: 'chip chip--time', textContent: `${recipe.prepTime} Min.` }) : null
          ].filter(Boolean)),
          createElement('div', { className: 'suggest-card__reasons' }, [
            createElement('strong', { textContent: 'Warum dieses Rezept: ' }),
            ...suggestion.matchReasons.map(reason =>
              createElement('span', { className: 'chip chip--reason', textContent: reason })
            )
          ]),
          recipe.cookedCount
            ? createElement('small', { className: 'suggest-card__stats', textContent: `${recipe.cookedCount}× gekocht` })
            : createElement('small', { className: 'suggest-card__stats', textContent: 'Noch nie gekocht' })
        ])
      ]);
      results.appendChild(card);
    });
  }
}
