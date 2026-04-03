import { t, getCategoryList, getDifficultyOptions, translateCategory, translateDifficulty } from '../i18n.js';

export function renderRecipeForm(targetEl, data) {
  const categories = getCategoryList();
  const difficulties = getDifficultyOptions();

  // The category value in data may be DE or EN – find the matching option in the current list
  const currentCat = translateCategory(data.category);
  const currentDiff = data.difficulty; // always stored as DE key (leicht/mittel/schwer)

  targetEl.innerHTML = `
    <div class="form-group">
      <label>${t('recipeForm.titleLabel')}</label>
      <input type="text" class="input" data-field="title" value="${esc(data.title || '')}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('recipeForm.categoryLabel')}</label>
        <select class="select" data-field="category">
          <option value="">${t('recipeForm.selectCategory')}</option>
          ${categories.map(c => `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>${t('recipeForm.originLabel')}</label>
        <input type="text" class="input" data-field="origin" value="${esc(data.origin || '')}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('recipeForm.prepTimeLabel')}</label>
        <input type="number" class="input" data-field="prepTime" value="${data.prepTime || ''}" />
      </div>
      <div class="form-group">
        <label>${t('recipeForm.servingsLabel')}</label>
        <input type="number" class="input" data-field="servings" value="${data.servings || ''}" />
      </div>
      <div class="form-group">
        <label>${t('recipeForm.difficultyLabel')}</label>
        <select class="select" data-field="difficulty">
          <option value="">${t('recipeForm.selectDifficulty')}</option>
          ${difficulties.map(d => `<option value="${d.key}" ${d.key === currentDiff ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>${t('recipeForm.mainIngredientLabel')}</label>
      <input type="text" class="input" data-field="mainIngredient" value="${esc(data.mainIngredient || '')}" />
    </div>
    <div class="form-group">
      <label>${t('recipeForm.sidesLabel')}</label>
      <input type="text" class="input" data-field="sides" value="${esc((data.sides || []).join(', '))}" />
    </div>
    <div class="form-group">
      <label>${t('recipeForm.tagsLabel')}</label>
      <input type="text" class="input" data-field="tags" value="${esc((data.tags || []).join(', '))}" />
    </div>
    <div class="form-group">
      <label>${t('recipeForm.ingredientsLabel')}</label>
      <textarea class="input input--textarea" data-field="ingredients" rows="3">${esc((data.ingredients || []).join('; '))}</textarea>
    </div>
    <div class="form-group">
      <label>${t('recipeForm.preparationLabel')}</label>
      <textarea class="input input--textarea" data-field="recipeText" rows="8" placeholder="${t('recipeForm.prepPlaceholder')}">${esc(data.recipeText || '')}</textarea>
    </div>
    <div class="form-group">
      <label>${t('recipeForm.descriptionLabel')}</label>
      <textarea class="input input--textarea" data-field="description" rows="2">${esc(data.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label>${t('recipeForm.notesLabel')}</label>
      <textarea class="input input--textarea" data-field="importNotes" rows="3"
                placeholder="${t('recipeForm.notesPlaceholder')}">${esc(data.importNotes || (Array.isArray(data.notes) ? data.notes.map(n => n.text).join('\n') : ''))}</textarea>
    </div>
    <div class="form-group">
      <label>${t('recipeForm.sourceNoteLabel')}</label>
      <input type="text" class="input" data-field="sourceNote"
             value="${esc(data.sourceNote || '')}"
             placeholder="${t('recipeForm.sourcePlaceholder')}" />
    </div>
  `;
}

export function readRecipeForm(formEl) {
  const get = (field) => {
    const el = formEl.querySelector(`[data-field="${field}"]`);
    return el ? el.value : '';
  };
  return {
    title: get('title'),
    category: get('category'),
    origin: get('origin'),
    prepTime: parseInt(get('prepTime')) || null,
    mainIngredient: get('mainIngredient'),
    sides: get('sides').split(',').map(s => s.trim()).filter(Boolean),
    tags: get('tags').split(',').map(s => s.trim()).filter(Boolean),
    ingredients: get('ingredients').split(';').map(s => s.trim()).filter(Boolean),
    description: get('description'),
    recipeText: get('recipeText'),
    servings: parseInt(get('servings')) || null,
    difficulty: get('difficulty'),
    importNotes: get('importNotes'),
    sourceNote: get('sourceNote'),
  };
}

function esc(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
