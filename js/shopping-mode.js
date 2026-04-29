import { t } from './i18n.js';

let wakeLock = null;

async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Opens a full-screen supermarket mode overlay.
 *
 * @param {Array}  items     – array of { id, name, amount, checked, storeId }
 * @param {Map}    storeMap  – Map<storeId, { name, color }>
 * @param {Function} onToggle – called with (id, newCheckedState) on each tap
 */
export function openShoppingMode(items, storeMap, onToggle) {
  const overlay = document.createElement('div');
  overlay.className = 'shop-mode';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="shop-mode__header">
      <span class="shop-mode__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        ${t('shopMode.title')}
      </span>
      <span class="shop-mode__progress" id="smProgress"></span>
      <button class="shop-mode__exit" id="smExit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        ${t('shopMode.exitBtn')}
      </button>
    </div>
    <div class="shop-mode__list" id="smList"></div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  acquireWakeLock();

  function renderList() {
    const listEl = overlay.querySelector('#smList');
    const progressEl = overlay.querySelector('#smProgress');
    if (!listEl) return;

    const checkedCount = items.filter(i => i.checked).length;
    if (progressEl) progressEl.textContent = t('shopMode.progress', checkedCount, items.length);

    // Build groups: one per store, plus a catch-all for items without store
    const groups = [];
    const assigned = new Set();

    for (const [storeId, store] of storeMap) {
      const gItems = items.filter(i => i.storeId === storeId);
      if (gItems.length) { groups.push({ label: store.name, color: store.color, items: gItems }); }
      gItems.forEach(i => assigned.add(String(i.id)));
    }
    const rest = items.filter(i => !assigned.has(String(i.id)));
    if (rest.length) groups.push({ label: storeMap.size > 0 ? t('shopMode.noStore') : null, color: null, items: rest });

    let html = '';
    for (const group of groups) {
      const unchecked = group.items.filter(i => !i.checked);
      const checked   = group.items.filter(i =>  i.checked);
      if (!group.items.length) continue;

      if (group.label) {
        html += `<div class="shop-mode__store-header">
          <span class="shop-mode__store-dot" style="background:${esc(group.color || '#888')}"></span>
          <span>${esc(group.label)}</span>
        </div>`;
      }

      for (const item of [...unchecked, ...checked]) {
        html += `
          <div class="shop-mode__item${item.checked ? ' shop-mode__item--checked' : ''}" data-id="${esc(String(item.id))}">
            <div class="shop-mode__item-check" aria-hidden="true">
              ${item.checked
                ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3" fill="var(--color-primary)" stroke="var(--color-primary)"/><polyline points="7,12 10,16 17,8" stroke="white" stroke-width="2.5"/></svg>`
                : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`
              }
            </div>
            <div class="shop-mode__item-body">
              ${item.amount ? `<span class="shop-mode__item-amount">${esc(item.amount)}</span>` : ''}
              <span class="shop-mode__item-name">${esc(item.name)}</span>
            </div>
          </div>`;
      }
    }

    listEl.innerHTML = html;
  }

  renderList();

  overlay.querySelector('#smList').addEventListener('click', e => {
    const itemEl = e.target.closest('.shop-mode__item');
    if (!itemEl) return;
    const idStr = itemEl.dataset.id;
    const item = items.find(i => String(i.id) === idStr);
    if (!item) return;
    item.checked = !item.checked;
    onToggle(idStr, item.checked);
    renderList();
  });

  function close() {
    releaseWakeLock();
    document.body.style.overflow = '';
    document.removeEventListener('visibilitychange', onVisibilityChange);
    overlay.remove();
  }

  async function onVisibilityChange() {
    if (document.visibilityState === 'visible' && !wakeLock) await acquireWakeLock();
  }

  overlay.querySelector('#smExit').addEventListener('click', close);
  document.addEventListener('visibilitychange', onVisibilityChange);

  overlay.tabIndex = -1;
  overlay.focus();
}
