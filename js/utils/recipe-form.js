const CATEGORIES = ['Vorspeise','Hauptspeise','Nachspeise','Fingerfood','Suppe','Salat','Beilage','Getränk','Snack','Brot/Gebäck','Gewürzmischungen','Kuchen','Soße','Sauerkonserven','Wurstrezept'];
const DIFFICULTIES = ['leicht','mittel','schwer'];

export function renderRecipeForm(targetEl, data) {
  targetEl.innerHTML = `
    <div class="form-group">
      <label>Titel</label>
      <input type="text" class="input" data-field="title" value="${esc(data.title || '')}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Kategorie</label>
        <select class="select" data-field="category">
          ${CATEGORIES.map(c => `<option value="${c}" ${c === data.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Herkunft</label>
        <input type="text" class="input" data-field="origin" value="${esc(data.origin || '')}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Zubereitungszeit (Min.)</label>
        <input type="number" class="input" data-field="prepTime" value="${data.prepTime || ''}" />
      </div>
      <div class="form-group">
        <label>Portionen</label>
        <input type="number" class="input" data-field="servings" value="${data.servings || ''}" />
      </div>
      <div class="form-group">
        <label>Schwierigkeit</label>
        <select class="select" data-field="difficulty">
          ${DIFFICULTIES.map(d => `<option value="${d}" ${d === data.difficulty ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Hauptzutat</label>
      <input type="text" class="input" data-field="mainIngredient" value="${esc(data.mainIngredient || '')}" />
    </div>
    <div class="form-group">
      <label>Beilagen (kommagetrennt)</label>
      <input type="text" class="input" data-field="sides" value="${esc((data.sides || []).join(', '))}" />
    </div>
    <div class="form-group">
      <label>Tags (kommagetrennt)</label>
      <input type="text" class="input" data-field="tags" value="${esc((data.tags || []).join(', '))}" />
    </div>
    <div class="form-group">
      <label>Zutaten (Strichpunkt-getrennt)</label>
      <textarea class="input input--textarea" data-field="ingredients" rows="3">${esc((data.ingredients || []).join('; '))}</textarea>
    </div>
    <div class="form-group">
      <label>Beschreibung</label>
      <textarea class="input input--textarea" data-field="description" rows="2">${esc(data.description || '')}</textarea>
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
    servings: parseInt(get('servings')) || null,
    difficulty: get('difficulty'),
  };
}

function esc(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
