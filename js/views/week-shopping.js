import { getWeekShoppingList, saveWeekShoppingList, deleteWeekShoppingList, getWeekPlan, getAllStores, getProductTags, setProductTag, getAllRecipes } from '../db.js';
import { $, showToast, debounce } from '../utils/helpers.js';
import { t, tRaw } from '../i18n.js';
import { normalizeShoppingList } from '../api.js';
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

  let items = list.items || [];
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

  const saveDebounced = debounce(async () => {
    try {
      const extrasArr = extras.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      await saveWeekShoppingList(items, extrasArr);
    } catch { /* ignore */ }
  }, 800);

  function renderView() {
    const checkedCount = items.filter(i => i.checked).length;

    // Filter items by active store
    const visibleItems = activeStoreFilter === 'none'
      ? items.filter(i => !i.storeId)
      : activeStoreFilter
        ? items.filter(i => i.storeId === activeStoreFilter)
        : items;

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

        <!-- Ingredient list -->
        <div class="week-shopping__list" id="wslList">
          ${visibleItems.length === 0
            ? `<p class="week-shopping__empty">${t('weekShopping.empty')}</p>`
            : visibleItems.map(item => renderItem(item, stores)).join('')
          }
        </div>

        <!-- AI optimize button -->
        <button class="btn btn--ghost btn--sm" id="btnWslAi">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ${t('weekShopping.aiOptimize')}
        </button>

        <!-- Extras -->
        <div class="week-shopping__extras">
          <div class="sl-section-label">${t('weekShopping.sectionExtras')}</div>
          <textarea id="wslExtras" class="input input--textarea sl-extras" rows="3" placeholder="${t('weekShopping.extrasPlaceholder')}">${esc(extras)}</textarea>
        </div>

        <!-- Actions -->
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
        const names = items.map(i => i.name);
        const normalized = await normalizeShoppingList(names);
        normalized.forEach((text, idx) => { if (items[idx]) items[idx].name = text; });
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
      a.href = url; a.download = 'wochen-einkauf.txt';
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

  function buildText() {
    const lines = [t('weekShopping.pdfTitle'), ''];
    if (plannedMeals.length) {
      plannedMeals.forEach(m => lines.push(`  ${m}`));
      lines.push('');
    }
    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    unchecked.forEach(i => {
      const store = i.storeId ? storeMap.get(i.storeId) : null;
      lines.push(`☐ ${i.amount ? i.amount + ' ' : ''}${i.name}${store ? ' [' + store.name + ']' : ''}`);
    });
    checked.forEach(i => {
      lines.push(`☑ ${i.amount ? i.amount + ' ' : ''}${i.name} (erledigt)`);
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
    const contentW = pageW - 2 * margin;
    let y = margin;

    const nl = (h = 5.5) => {
      y += h;
      if (y > pageH - margin) { doc.addPage(); y = margin; }
    };

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(t('weekShopping.pdfTitle'), margin, y);
    nl(6);

    // Meals
    if (plannedMeals.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120);
      plannedMeals.forEach(m => { doc.text(m, margin, y); nl(4); });
      doc.setTextColor(0);
    }

    // Divider
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    nl(4);

    // Items
    doc.setFontSize(9);
    const boxSize = 2.8;
    const lh = 5.5;

    const grouped = groupByStore(items, storeMap);
    for (const [storeName, storeItems] of grouped) {
      if (storeName !== '__all') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(storeName.toUpperCase(), margin, y);
        nl(4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }
      for (const item of storeItems) {
        const label = (item.amount ? item.amount + ' ' : '') + item.name;
        const lines = doc.splitTextToSize(label, contentW - boxSize - 3);
        if (item.checked) {
          doc.setTextColor(150);
          doc.setDrawColor(150);
        } else {
          doc.setTextColor(0);
          doc.setDrawColor(80);
        }
        if (!item.checked) {
          doc.rect(margin, y - boxSize + 0.5, boxSize, boxSize);
        } else {
          // Strikethrough box (checked)
          doc.rect(margin, y - boxSize + 0.5, boxSize, boxSize);
          doc.line(margin, y - boxSize + 0.5, margin + boxSize, y + 0.5);
        }
        doc.text(lines, margin + boxSize + 3, y);
        if (item.checked) {
          // Strike through text
          const tw = doc.getTextWidth(label.length > 30 ? label.slice(0, 30) + '…' : label);
          doc.line(margin + boxSize + 3, y - 1.5, margin + boxSize + 3 + Math.min(tw, contentW - boxSize - 3), y - 1.5);
        }
        y += Math.max(lines.length * lh * 0.9, lh);
        if (y > pageH - margin) { doc.addPage(); y = margin; }
      }
    }

    // Extras
    const extrasArr = extras.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (extrasArr.length) {
      doc.setTextColor(0);
      doc.setDrawColor(200);
      doc.line(margin, y, pageW - margin, y);
      nl(4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(t('weekShopping.pdfExtras'), margin, y);
      nl(5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(80);
      for (const e of extrasArr) {
        const lines = doc.splitTextToSize(e, contentW - boxSize - 3);
        doc.rect(margin, y - boxSize + 0.5, boxSize, boxSize);
        doc.text(lines, margin + boxSize + 3, y);
        y += Math.max(lines.length * lh * 0.9, lh);
        if (y > pageH - margin) { doc.addPage(); y = margin; }
      }
    }

    doc.save('wochen-einkauf.pdf');
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
