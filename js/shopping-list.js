import { getSetting, setSetting } from './db.js';
import { showToast } from './utils/helpers.js';
import { t } from './i18n.js';
import { generateShoppingListPDF } from './pdf-generator.js';
import { normalizeShoppingList } from './api.js';

// ---------------------------------------------------------------------------
// Default pantry items (always-in-stock staples)
// ---------------------------------------------------------------------------

export const DEFAULT_PANTRY_DE = [
  'Salz', 'Pfeffer', 'Zucker', 'Öl', 'Olivenöl', 'Butter', 'Mehl',
  'Essig', 'Senf', 'Knoblauch', 'Zwiebel', 'Wasser', 'Milch', 'Ei',
  'Backpulver', 'Natron', 'Speisestärke', 'Brühe', 'Lorbeer', 'Paprika',
];

export const DEFAULT_PANTRY_EN = [
  'salt', 'pepper', 'sugar', 'oil', 'olive oil', 'butter', 'flour',
  'vinegar', 'mustard', 'garlic', 'onion', 'water', 'milk', 'egg',
  'baking powder', 'baking soda', 'cornstarch', 'broth', 'bay leaf', 'paprika',
];

// ---------------------------------------------------------------------------
// Load pantry items from settings (falls back to defaults)
// ---------------------------------------------------------------------------

export async function loadPantryItems() {
  const stored = await getSetting('pantryItems');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  // Detect UI language to pick the right default list
  const lang = document.documentElement.lang || 'de';
  return lang === 'en' ? [...DEFAULT_PANTRY_EN] : [...DEFAULT_PANTRY_DE];
}

export async function savePantryItems(items) {
  await setSetting('pantryItems', JSON.stringify(items));
}

// ---------------------------------------------------------------------------
// Pantry matching: returns true if ingredient string is likely a pantry staple
// ---------------------------------------------------------------------------

function isPantryItem(ingredientStr, pantryItems) {
  const lower = ingredientStr.toLowerCase();
  return pantryItems.some(p => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Strip quantity from seasoning/spice ingredients.
// Applies when the unit is EL, TL, Msp., Prise, or "nach Geschmack" etc.
// These are bought as a whole package anyway, so amounts are irrelevant.
// ---------------------------------------------------------------------------

const SPICE_UNIT_RE = /^[\d\s,./''/½¼¾⅓⅔⅛⅜⅝⅞–-]*(EL|TL|Msp\.?|Prise[n]?|n\.B\.|nach\s+Geschmack|nach\s+Belieben)\s+/i;

function stripSpiceQuantity(ingredientStr) {
  return ingredientStr.replace(SPICE_UNIT_RE, '').trim();
}

function isSpiceUnit(ingredientStr) {
  return SPICE_UNIT_RE.test(ingredientStr);
}

// ---------------------------------------------------------------------------
// Build plain-text shopping list
// ---------------------------------------------------------------------------

function buildText(title, checkedIngredients, extras) {
  const lines = [];
  lines.push(t('shoppingList.title', title));
  lines.push('');
  checkedIngredients.forEach(i => lines.push(`• ${i}`));
  if (extras.length) {
    lines.push('');
    lines.push(t('shoppingList.pdfExtras'));
    extras.forEach(l => lines.push(`• ${l}`));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Open shopping list modal
// ---------------------------------------------------------------------------

export async function openShoppingListModal(recipe) {
  const pantryItems = await loadPantryItems();

  // Build ingredient list with pantry flag and optional quantity stripping
  const ingredients = (recipe.ingredients || []).map(i => ({
    text: i,
    displayText: isSpiceUnit(i) ? stripSpiceQuantity(i) : i,
    isPantry: isPantryItem(i, pantryItems),
    checked: !isPantryItem(i, pantryItems),
  }));

  const modalId = 'shoppingListModal';
  // Remove any existing modal
  document.getElementById(modalId)?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box modal__box--wide shopping-list-modal">
      <div class="modal__header">
        <h2>${escHtml(t('shoppingList.title', recipe.title || ''))}</h2>
        <button class="modal__close" id="slClose" aria-label="${escHtml(t('shoppingList.btnClose'))}">&times;</button>
      </div>
      <div class="modal__body">

        <div class="sl-section-label sl-section-label--with-action">
          <span>${escHtml(t('shoppingList.ingredientsSection'))}</span>
          <button class="btn btn--ghost btn--sm sl-ai-btn" id="slBtnAi" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${escHtml(t('shoppingList.btnAiOptimize'))}
          </button>
        </div>
        <p class="sl-pantry-hint">${escHtml(t('shoppingList.pantryHint'))}</p>
        <ul class="sl-ingredient-list" id="slIngredients">
          ${ingredients.map((ing, idx) => `
            <li class="sl-ingredient${ing.isPantry ? ' sl-ingredient--pantry' : ''}">
              <label class="sl-ingredient__label">
                <input type="checkbox" class="sl-ingredient__cb" data-idx="${idx}"
                  ${ing.checked ? 'checked' : ''} />
                <span class="sl-ingredient__text">${escHtml(ing.displayText)}</span>
              </label>
            </li>
          `).join('')}
        </ul>

        <div class="sl-section-label">${escHtml(t('shoppingList.extrasSection'))}</div>
        <textarea id="slExtras" class="input input--textarea sl-extras"
          rows="4" placeholder="${escHtml(t('shoppingList.extrasPlaceholder'))}"></textarea>

      </div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="slBtnCopy">${escHtml(t('shoppingList.btnCopy'))}</button>
        <button class="btn btn--secondary" id="slBtnTxt">${escHtml(t('shoppingList.btnTxt'))}</button>
        <button class="btn btn--primary" id="slBtnPdf">${escHtml(t('shoppingList.btnPdf'))}</button>
        <button class="btn btn--ghost" id="slCloseBtn">${escHtml(t('shoppingList.btnClose'))}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // --- Helpers to get current state ---
  function getCheckedIngredients() {
    return [...modal.querySelectorAll('.sl-ingredient__cb')]
      .filter(cb => cb.checked)
      .map(cb => ingredients[parseInt(cb.dataset.idx, 10)].displayText);
  }

  function parseExtras() {
    return modal.querySelector('#slExtras').value
      .split(/[,\n]/)
      .map(l => l.trim())
      .filter(Boolean);
  }

  function getText() {
    return buildText(recipe.title || '', getCheckedIngredients(), parseExtras());
  }

  function close() {
    modal.remove();
  }

  // --- Event listeners ---
  modal.querySelector('#slClose').addEventListener('click', close);
  modal.querySelector('#slCloseBtn').addEventListener('click', close);
  modal.querySelector('.modal__backdrop').addEventListener('click', close);

  modal.querySelector('#slBtnCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      showToast(t('shoppingList.copied'), 'success');
    } catch {
      showToast(t('shoppingList.copyFailed'), 'error');
    }
  });

  modal.querySelector('#slBtnTxt').addEventListener('click', () => {
    const safeTitle = (recipe.title || 'einkaufszettel').replace(/[^a-z0-9äöüß]/gi, '_').toLowerCase();
    downloadText(getText(), `${safeTitle}_einkauf.txt`);
  });

  modal.querySelector('#slBtnPdf').addEventListener('click', () => {
    generateShoppingListPDF({
      title: recipe.title || '',
      items: getCheckedIngredients(),
      extras: parseExtras(),
    });
  });

  modal.querySelector('#slBtnAi').addEventListener('click', async () => {
    const btn = modal.querySelector('#slBtnAi');
    btn.disabled = true;
    btn.textContent = escHtml(t('shoppingList.aiOptimizing'));
    try {
      const currentTexts = ingredients.map(i => i.displayText);
      const normalized = await normalizeShoppingList(currentTexts);
      normalized.forEach((text, idx) => { ingredients[idx].displayText = text; });
      modal.querySelectorAll('.sl-ingredient__text').forEach((el, idx) => {
        el.textContent = ingredients[idx].displayText;
      });
      showToast(t('shoppingList.aiOptimized'), 'success');
    } catch (err) {
      showToast(err.message || t('shoppingList.aiOptimizeError'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${escHtml(t('shoppingList.btnAiOptimize'))}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Tiny HTML-escape helper (no dependency on utils to keep module self-contained)
// ---------------------------------------------------------------------------

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
