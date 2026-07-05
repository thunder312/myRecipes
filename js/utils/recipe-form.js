import { t, getCategoryList, getDifficultyOptions, translateCategory, translateDifficulty } from '../i18n.js';

export function initTimeListeners(formEl) {
  const update = () => {
    const w = parseInt(formEl.querySelector('[data-field="workTime"]')?.value) || 0;
    const c = parseInt(formEl.querySelector('[data-field="cookTime"]')?.value) || 0;
    const r = parseInt(formEl.querySelector('[data-field="restTime"]')?.value) || 0;
    const total = w + c + r;
    const el = formEl.querySelector('[data-time-total]');
    if (el) el.textContent = total > 0 ? `${total} Min.` : '–';
  };
  for (const field of ['workTime', 'cookTime', 'restTime']) {
    formEl.querySelector(`[data-field="${field}"]`)?.addEventListener('input', update);
  }
}

export function renderRecipeForm(targetEl, data) {
  const categories = getCategoryList();
  const difficulties = getDifficultyOptions();

  // The category value in data may be DE or EN – find the matching option in the current list
  const currentCat = translateCategory(data.category);
  const currentDiff = data.difficulty; // always stored as DE key (leicht/mittel/schwer)

  targetEl.innerHTML = `<div class="form-group recipe-form__image-group ${data._imageBlob ? '' : 'hidden'}" data-image-group>
      <label>${t('recipeForm.imageLabel')}</label>
      <img class="recipe-form__image-preview" data-image-preview alt=""
           src="${data._imageBlob ? `data:${data._imageMimeType || 'image/jpeg'};base64,${data._imageBlob}` : ''}" />
    </div>
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
    <div class="form-group">
      <label>${t('recipeForm.timeLabel')}</label>
      <div class="form-row form-row--time">
        <div class="form-group">
          <label class="label--sub">${t('recipeForm.workTimeLabel')}</label>
          <input type="number" class="input" data-field="workTime" value="${data.workTime || ''}" min="0" />
        </div>
        <div class="form-group">
          <label class="label--sub">${t('recipeForm.cookTimeLabel')}</label>
          <input type="number" class="input" data-field="cookTime" value="${data.cookTime || ''}" min="0" />
        </div>
        <div class="form-group">
          <label class="label--sub">${t('recipeForm.restTimeLabel')}</label>
          <input type="number" class="input" data-field="restTime" value="${data.restTime || ''}" min="0" />
        </div>
        <div class="form-group form-group--total-time">
          <label class="label--sub">${t('recipeForm.totalTimeLabel')}</label>
          <span class="time-total" data-time-total>${data.prepTime ? data.prepTime + ' Min.' : '–'}</span>
        </div>
      </div>
    </div>
    <div class="form-row">
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
      <label>${t('recipeForm.sourceNoteLabel')}</label>
      <input type="text" class="input" data-field="sourceNote"
             value="${esc(data.sourceNote || '')}"
             placeholder="${t('recipeForm.sourcePlaceholder')}" />
    </div>
  `;
  initTimeListeners(targetEl);
}

/** Updates the image shown in a rendered recipe form (e.g. after picking an AI image search result). */
export function updateFormImage(formEl, imageBlob, imageMimeType) {
  const group = formEl.querySelector('[data-image-group]');
  const img = formEl.querySelector('[data-image-preview]');
  if (!group || !img) return;
  if (imageBlob) {
    img.src = `data:${imageMimeType || 'image/jpeg'};base64,${imageBlob}`;
    group.classList.remove('hidden');
  } else {
    img.src = '';
    group.classList.add('hidden');
  }
}

export function readRecipeForm(formEl) {
  const get = (field) => {
    const el = formEl.querySelector(`[data-field="${field}"]`);
    return el ? el.value : '';
  };
  const workTime = parseInt(get('workTime')) || null;
  const cookTime = parseInt(get('cookTime')) || null;
  const restTime = parseInt(get('restTime')) || null;
  const prepTime = (workTime || 0) + (cookTime || 0) + (restTime || 0) || null;
  return {
    title: get('title'),
    category: get('category'),
    origin: get('origin'),
    workTime,
    cookTime,
    restTime,
    prepTime,
    mainIngredient: get('mainIngredient'),
    sides: get('sides').split(',').map(s => s.trim()).filter(Boolean),
    tags: get('tags').split(',').map(s => s.trim()).filter(Boolean),
    ingredients: get('ingredients').split(';').map(s => s.trim()).filter(Boolean),
    description: get('description'),
    recipeText: get('recipeText'),
    servings: parseInt(get('servings')) || null,
    difficulty: get('difficulty'),
    sourceNote: get('sourceNote'),
  };
}

function esc(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
