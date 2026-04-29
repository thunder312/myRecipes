import { getWeekShoppingList, saveWeekShoppingList, deleteWeekShoppingList, getWeekPlan, getAllStores, getProductTags, setProductTag, getAllRecipes } from '../db.js';
import { $, showToast, debounce } from '../utils/helpers.js';
import { t, tRaw } from '../i18n.js';
import { normalizeShoppingList, resolveSlashIngredients } from '../api.js';
import { loadPantryItems } from '../shopping-list.js';
import { jsPDF } from 'jspdf';

export async function render(container) {

  // Load data in parallel
  let list = null, stores = [], productTags = [], plan = null, allRecipes = [];
  try {
    [list, stores, productTags, plan, allRecipes] = await Promise.all([
      getWeekShoppingList(),
      getAllStores(),
      getProductTags(),
      getWeekPlan(),
      getAllRecipes(),
    ]);
  } catch (err) {
    showToast(err.message, 'error');
  }

  // Build store map: id → store
  const storeMap = new Map(stores.map(s => [s.id, s]));
  // Build tag map: productName → storeId
  const tagMap = new Map(productTags.map(p => [p.productName, p.storeId]));

  if (!list) {
    container.innerHTML = `
      <div class="week-shopping">
        <h1>${t('weekShopping.title')}</h1>
        <div class="empty-state">
          <div class="empty-state__icon">🛒</div>
          <p>${t('weekShopping.notFound')}</p>
          <p class="empty-state__hint">${t('weekShopping.notFoundHint')}</p>
          <a href="#suggest" class="btn btn--primary">${t('weekShopping.goToWeekPlan')}</a>
        </div>
      </div>
    `;
    return;
  }

  let items = (list.items || []).sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'de'));
  let extras = (list.extras || []).join(', ');

  // Determine planned recipe titles from plan
  const planSlots = Array.isArray(plan?.slots) ? plan.slots : [];
  const recipeMap = new Map(allRecipes.map(r => [r.id, r]));
  const days = tRaw('suggest.days') || ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const plannedMeals = planSlots
    .map((id, i) => id ? `${days[i]}: ${recipeMap.get(id)?.title || ''}` : null)
    .filter(Boolean);

  // Current store filter
  let activeStoreFilter = null; // null = all
  let showMealsInExport = false; // default: hide meal plan in export

  const saveDebounced = debounce(async () => {
    try {
      const extrasArr = extras.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      await saveWeekShoppingList(items, extrasArr);
    } catch { /* ignore */ }
  }, 800);

  function getExportItems() {
    const sorted = [...items].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'de'));
    if (activeStoreFilter === 'none') return sorted.filter(i => !i.storeId);
    if (activeStoreFilter) return sorted.filter(i => i.storeId === activeStoreFilter);
    return sorted;
  }

  function renderView() {
    const checkedCount = items.filter(i => i.checked).length;
    const visibleItems = getExportItems();

    container.innerHTML = `
      <div class="week-shopping">
        <div class="week-shopping__header">
          <h1>${t('weekShopping.title')}</h1>
          <a href="#suggest/week" class="btn btn--ghost btn--sm">${t('weekShopping.backToplan')}</a>
        </div>

        ${plannedMeals.length ? `
          <div class="week-shopping__meals-label">${t('weekShopping.mealsLabel')}</div>
          <div class="week-shopping__meals">
            ${plannedMeals.map(m => `<span class="chip chip--neutral">${esc(m)}</span>`).join('')}
          </div>
        ` : ''}

        ${checkedCount > 0 ? `<p class="week-shopping__checked-hint">${t('weekShopping.checkedCount', checkedCount)}</p>` : ''}

        <!-- Store filter chips -->
        <div class="week-shopping__store-filter">
          <button class="chip chip--filter${!activeStoreFilter ? ' chip--filter-active' : ''}" data-filter="all">${t('weekShopping.filterAll')}</button>
          ${stores.map(s => `
            <button class="chip chip--filter${activeStoreFilter === s.id ? ' chip--filter-active' : ''}" data-filter="${s.id}" style="--store-color:${s.color}">
              <span class="store-dot" style="background:${s.color}"></span>${esc(s.name)}
            </button>
          `).join('')}
          <button class="chip chip--filter${activeStoreFilter === 'none' ? ' chip--filter-active' : ''}" data-filter="none">${t('weekShopping.filterUnsorted')}</button>
        </div>

        <!-- AI optimize button -->
        <button class="btn btn--ghost btn--sm" id="btnWslAi">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
          ${t('weekShopping.aiOptimize')}
        </button>

        <!-- Ingredient list -->
        <div class="week-shopping__list" id="wslList">
          ${visibleItems.length === 0
            ? `<p class="week-shopping__empty">${t('weekShopping.empty')}</p>`
            : visibleItems.map(item => renderItem(item, stores)).join('')
          }
        </div>

        <!-- Extras -->
        <div class="week-shopping__extras">
          <div class="sl-section-label">${t('weekShopping.sectionExtras')}</div>
          <textarea id="wslExtras" class="input input--textarea sl-extras" rows="3" placeholder="${t('weekShopping.extrasPlaceholder')}">${esc(extras)}</textarea>
        </div>

        <!-- Actions -->
        <div class="week-shopping__export-options">
          <label class="wsl-export-toggle">
            <input type="checkbox" id="chkShowMeals" ${showMealsInExport ? 'checked' : ''} />
            ${t('weekShopping.exportMeals')}
          </label>
        </div>
        <div class="week-shopping__actions">
          <button class="btn btn--ghost" id="btnWslCopy">${t('weekShopping.copyBtn')}</button>
          <button class="btn btn--secondary" id="btnWslTxt">${t('weekShopping.txtBtn')}</button>
          <button class="btn btn--primary" id="btnWslPdf">${t('weekShopping.pdfBtn')}</button>
          <button class="btn btn--ghost btn--danger-text week-shopping__delete" id="btnWslDelete">${t('weekShopping.deleteBtn')}</button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderItem(item, stores) {
    const store = item.storeId ? storeMap.get(item.storeId) : null;
    const storeColor = store ? store.color : 'transparent';
    return `
      <div class="wsl-item${item.checked ? ' wsl-item--checked' : ''}" data-id="${item.id}" style="border-left: 3px solid ${storeColor}">
        <input type="checkbox" class="wsl-item__cb" data-id="${item.id}" ${item.checked ? 'checked' : ''} />
        <div class="wsl-item__body">
          <div class="wsl-item__name">${esc(item.name)}</div>
          <div class="wsl-item__amount">${esc(item.amount || '')}</div>
          ${item.recipes?.length ? `<div class="wsl-item__recipes">${item.recipes.map(esc).join(', ')}</div>` : ''}
        </div>
        <select class="wsl-item__store-select" data-id="${item.id}" title="${t('weekShopping.storeLabel')}">
          <option value="">${t('weekShopping.noStore')}</option>
          ${stores.map(s => `<option value="${s.id}" ${item.storeId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function bindEvents() {
    // Meal plan in export toggle
    const chkMeals = container.querySelector('#chkShowMeals');
    if (chkMeals) chkMeals.addEventListener('change', () => { showMealsInExport = chkMeals.checked; });

    // Store filter
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        activeStoreFilter = f === 'all' ? null : f === 'none' ? 'none' : parseInt(f, 10);
        renderView();
      });
    });

    // Checkbox toggle
    container.querySelectorAll('.wsl-item__cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = parseInt(cb.dataset.id, 10);
        const item = items.find(i => i.id === id);
        if (item) {
          item.checked = cb.checked;
          cb.closest('.wsl-item').classList.toggle('wsl-item--checked', cb.checked);
          saveDebounced();
        }
      });
    });

    // Store select
    container.querySelectorAll('.wsl-item__store-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = parseInt(sel.dataset.id, 10);
        const item = items.find(i => i.id === id);
        if (!item) return;
        const storeId = sel.value ? parseInt(sel.value, 10) : null;
        item.storeId = storeId;
        // Update border color immediately
        const row = sel.closest('.wsl-item');
        const store = storeId ? storeMap.get(storeId) : null;
        row.style.borderLeft = `3px solid ${store ? store.color : 'transparent'}`;
        // Persist product tag globally
        if (storeId) {
          try { await setProductTag(item.name, storeId); } catch { /* ignore */ }
        }
        saveDebounced();
      });
    });

    // Extras textarea
    const extrasEl = $('#wslExtras', container);
    if (extrasEl) {
      extrasEl.addEventListener('input', () => {
        extras = extrasEl.value;
        saveDebounced();
      });
    }

    // AI optimize
    $('#btnWslAi', container)?.addEventListener('click', async () => {
      const btn = $('#btnWslAi', container);
      btn.disabled = true;
      btn.textContent = t('weekShopping.aiOptimizing');
      try {
        // Step 1 – resolve "/" items (e.g. "Champignons/Austernpilze" → two separate items)
        const slashIdxs = items.reduce((acc, item, i) => { if (item.name.includes('/')) acc.push(i); return acc; }, []);
        if (slashIdxs.length > 0) {
          const resolved = await resolveSlashIngredients(slashIdxs.map(i => items[i].name));
          // process in reverse so splicing doesn't shift indices
          for (let ri = slashIdxs.length - 1; ri >= 0; ri--) {
            const parts = resolved[ri];
            if (!Array.isArray(parts)) continue; // keep as-is
            const original = items.splice(slashIdxs[ri], 1)[0];
            for (const partName of parts) {
              const name = partName.trim();
              if (!name) continue;
              const existing = items.find(it => it.name.toLowerCase() === name.toLowerCase());
              if (existing) {
                // merge recipe sources
                (original.recipes || []).forEach(r => { if (!existing.recipes?.includes(r)) existing.recipes?.push(r); });
              } else {
                items.push({ id: `${Date.now()}-${Math.random()}`, name, amount: original.amount || '', recipes: [...(original.recipes || [])], checked: false, storeId: original.storeId || null });
              }
            }
          }
        }

        // Step 2 – normalize names and apply pantry
        const pantry = await loadPantryItems();
        const inputs = items.map(i => [i.amount, i.name].filter(Boolean).join(' '));
        const normalized = await normalizeShoppingList(inputs);
        normalized.forEach((text, idx) => {
          if (!items[idx]) return;
          const { amount, name } = splitAmountAndName(text);
          items[idx].amount = amount;
          items[idx].name = name;
          if (matchesPantry(name, pantry)) items[idx].checked = true;
        });
        items = deduplicateItems(items);
        items.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'de'));
        saveDebounced();
        renderView();
        showToast(t('weekShopping.aiOptimized'), 'success');
      } catch (err) {
        showToast(err.message || t('weekShopping.aiOptimizeError'), 'error');
        renderView();
      }
    });

    // Copy
    $('#btnWslCopy', container)?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(buildText());
        showToast(t('weekShopping.copied'), 'success');
      } catch {
        showToast(t('weekShopping.copyFailed'), 'error');
      }
    });

    // TXT download
    $('#btnWslTxt', container)?.addEventListener('click', () => {
      const blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = exportFilename('txt');
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // PDF download
    $('#btnWslPdf', container)?.addEventListener('click', () => generatePDF());

    // Delete list
    $('#btnWslDelete', container)?.addEventListener('click', async () => {
      if (!confirm(t('weekShopping.deleteConfirm'))) return;
      try {
        await deleteWeekShoppingList();
        showToast(t('weekShopping.deleted'), 'success');
        window.location.hash = '#suggest';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function exportFilename(ext) {
    const activeStore = activeStoreFilter && activeStoreFilter !== 'none' ? storeMap.get(activeStoreFilter) : null;
    const slug = activeStore ? '-' + activeStore.name.toLowerCase().replace(/\s+/g, '-') : '';
    return `wochen-einkauf${slug}.${ext}`;
  }

  function buildText() {
    const exportItems = getExportItems();
    const lines = [t('weekShopping.pdfTitle'), ''];
    if (showMealsInExport && plannedMeals.length) {
      plannedMeals.forEach(m => lines.push(`  ${m}`));
      lines.push('');
    }
    exportItems.filter(i => !i.checked).forEach(i => {
      const store = i.storeId ? storeMap.get(i.storeId) : null;
      lines.push(`☐ ${i.amount ? i.amount + ' ' : ''}${i.name}${store ? ' [' + store.name + ']' : ''}`);
    });
    const extrasArr = extras.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (extrasArr.length) {
      lines.push('');
      lines.push(t('weekShopping.pdfExtras'));
      extrasArr.forEach(e => lines.push(`☐ ${e}`));
    }
    return lines.join('\n');
  }

  function generatePDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a6' });
    const margin = 10;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const colGap = 5;
    const colW = (pageW - 2 * margin - colGap) / 2;
    const boxSize = 2.5;
    const lh = 5;
    let y = margin;
    let col = 0;         // 0 = left column, 1 = right column
    let yColStart = margin;

    const xOf = () => margin + col * (colW + colGap);

    function nextColumn() {
      if (col === 0) {
        col = 1;
        y = yColStart;
      } else {
        doc.addPage();
        col = 0;
        y = margin;
        yColStart = margin;
      }
    }

    // ---- Header: full page width ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(t('weekShopping.pdfTitle'), margin, y);
    y += 6;

    if (showMealsInExport && plannedMeals.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120);
      plannedMeals.forEach(m => { doc.text(m, margin, y); y += 4; });
      doc.setTextColor(0);
    }

    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
    yColStart = y;  // columns begin here

    // ---- Items: 2-column ----
    doc.setFontSize(8);

    const grouped = groupByStore(getExportItems().filter(i => !i.checked), storeMap);
    for (const [storeName, storeItems] of grouped) {
      if (storeName !== '__all') {
        // Store heading: keep heading and at least one item together
        const headH = 4.5;
        if (y + headH + lh > pageH - margin) nextColumn();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(0);
        doc.text(storeName.toUpperCase(), xOf(), y);
        y += headH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
      }
      for (const item of storeItems) {
        const label = (item.amount ? item.amount + ' ' : '') + item.name;
        const lines = doc.splitTextToSize(label, colW - boxSize - 2);
        const itemH = Math.max(lines.length * lh * 0.9, lh);
        if (y + itemH > pageH - margin) nextColumn();
        const x = xOf();
        doc.setTextColor(0);
        doc.setDrawColor(80);
        doc.rect(x, y - boxSize + 0.5, boxSize, boxSize);
        doc.text(lines, x + boxSize + 2, y);
        y += itemH;
      }
    }

    // ---- Extras: continue in columns ----
    const extrasArr = extras.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (extrasArr.length) {
      const headH = 5;
      if (y + headH + lh > pageH - margin) nextColumn();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0);
      doc.text(t('weekShopping.pdfExtras'), xOf(), y);
      y += headH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setDrawColor(80);
      for (const e of extrasArr) {
        const lines = doc.splitTextToSize(e, colW - boxSize - 2);
        const itemH = Math.max(lines.length * lh * 0.9, lh);
        if (y + itemH > pageH - margin) nextColumn();
        const x = xOf();
        doc.rect(x, y - boxSize + 0.5, boxSize, boxSize);
        doc.text(lines, x + boxSize + 2, y);
        y += itemH;
      }
    }

    doc.save(exportFilename('pdf'));
  }

  function sortKey(name) {
    // Strip leading numbers/fractions and the immediately following word (unit or piece count)
    // so "250 g Austernpilze" → "austernpilze", "1 Lauch" → "lauch"
    return name
      .replace(/^[\d\s.,/½¼¾⅓⅔⅛⅜⅝⅞-]+\S*\s*/, '')
      .trim()
      .toLowerCase();
  }

  // Splits "500g Hackfleisch" → { amount: "500g", name: "Hackfleisch" }
  function splitAmountAndName(text) {
    const m = text.match(
      /^([\d½¼¾⅓⅔⅛⅜⅝⅞][,./\d]*(?:\s*(?:g|kg|ml|l|cl|EL|TL|Stück|Stk\.?|Dosen?|Gläser|Glas|Pkg\.?|Packungen?|Bund|Zehen?|Scheiben?|Köpfe?|Becher|Flaschen?|Tassen?|Prisen?|Beutel|Stangen?|Zweige?))?)(\s+.+)/i
    );
    if (m) return { amount: m[1].trim(), name: m[2].trim() };
    return { amount: '', name: text };
  }

  // Merge two amount strings: "2" + "2" → "4", "500g" + "300g" → "800g", fallback: "a + b"
  function mergeAmounts(a1, a2) {
    if (!a1) return a2 || '';
    if (!a2) return a1;
    const parse = s => { const m = s.match(/^([\d,.]+)\s*(.*)/); return m ? { num: parseFloat(m[1].replace(',', '.')), unit: m[2].trim() } : null; };
    const p1 = parse(a1); const p2 = parse(a2);
    if (p1 && p2 && p1.unit.toLowerCase() === p2.unit.toLowerCase()) {
      const sum = p1.num + p2.num;
      const str = Number.isInteger(sum) ? String(sum) : sum.toFixed(1).replace('.', ',');
      return p1.unit ? `${str} ${p1.unit}` : str;
    }
    return `${a1} + ${a2}`;
  }

  // After normalization, merge items that now share the same name
  function deduplicateItems(arr) {
    const seen = new Map();
    const result = [];
    for (const item of arr) {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key)) {
        const ex = result[seen.get(key)];
        ex.amount = mergeAmounts(ex.amount, item.amount);
        (item.recipes || []).forEach(r => { if (!ex.recipes) ex.recipes = []; if (!ex.recipes.includes(r)) ex.recipes.push(r); });
        if (item.checked) ex.checked = true;
      } else {
        seen.set(key, result.length);
        result.push({ ...item, recipes: [...(item.recipes || [])] });
      }
    }
    return result;
  }

  // Pantry match: short items (< 4 chars) only match at word boundaries
  // to avoid "ei" matching "Schweinefilet" etc.
  function matchesPantry(text, pantry) {
    const lower = text.toLowerCase();
    return pantry.some(p => {
      const pl = p.toLowerCase();
      if (pl.length < 4) {
        // Word-level: exact word, word-start (for plurals), or compound-end
        const words = lower.split(/\s+/);
        return lower.endsWith(pl) || words.some(w => w === pl || w.startsWith(pl));
      }
      return lower.includes(pl);
    });
  }

  function groupByStore(items, storeMap) {
    if (!stores.length) return new Map([['__all', items]]);
    const grouped = new Map();
    for (const item of items) {
      const store = item.storeId ? storeMap.get(item.storeId) : null;
      const key = store ? store.name : '—';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    return grouped;
  }

  renderView();
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
