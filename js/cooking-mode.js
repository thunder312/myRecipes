import { $ } from './utils/helpers.js';
import { t } from './i18n.js';

function splitIntoSteps(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = text.split(/;\s+|\.\s+(?=[A-ZÜÄÖA-Z])/);
  const result = parts.map(s => s.trim()).filter(Boolean);
  return result.length > 1 ? result : lines;
}

function isStepHeading(s) {
  return /^[^.!?]{1,60}:\s*$/.test(s);
}

function buildPages(text) {
  const raw = splitIntoSteps(text);
  const alreadyNumbered = raw.length > 1 && /^\d+[.)]\s/.test(raw[0]);
  return raw.map(s => {
    if (isStepHeading(s)) return { type: 'heading', text: s.replace(/:\s*$/, '').trimEnd() };
    return { type: 'step', text: alreadyNumbered ? s.replace(/^\d+[.)]\s*/, '') : s };
  });
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let wakeLock = null;

async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

export function openCookingMode(recipe, scaledIngredients) {
  const pages = buildPages(recipe.recipeText || '');
  if (!pages.length) return;

  let currentPage = 0;
  const totalSteps = pages.filter(p => p.type === 'step').length;

  const overlay = document.createElement('div');
  overlay.className = 'cook-mode';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="cook-mode__header">
      <button class="cook-mode__ingr-btn" id="cmIngrBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
        <span>${t('cookMode.ingredientsBtn', scaledIngredients.length)}</span>
      </button>
      <div class="cook-mode__progress-text" id="cmProgressText"></div>
      <button class="cook-mode__exit-btn" id="cmExit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span>${t('cookMode.exitBtn')}</span>
      </button>
    </div>

    <div class="cook-mode__ingr-panel" id="cmIngrPanel" hidden>
      <div class="cook-mode__ingr-header">
        <span>${t('cookMode.ingredientsTitle')}</span>
        <button class="cook-mode__ingr-close" id="cmIngrClose">✕</button>
      </div>
      <ul class="cook-mode__ingr-list">
        ${scaledIngredients.map(i => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>

    <div class="cook-mode__step-area">
      <div class="cook-mode__step-inner" id="cmStepInner"></div>
    </div>

    <div class="cook-mode__nav">
      <button class="cook-mode__nav-btn cook-mode__nav-btn--prev" id="cmPrev">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <polyline points="15,18 9,12 15,6"/>
        </svg>
        <span>${t('cookMode.prevBtn')}</span>
      </button>
      <div class="cook-mode__dots" id="cmDots"></div>
      <button class="cook-mode__nav-btn cook-mode__nav-btn--next" id="cmNext">
        <span id="cmNextLabel"></span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" id="cmNextIcon">
          <polyline points="9,18 15,12 9,6"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  acquireWakeLock();

  function stepNumber(upTo) {
    let n = 0;
    for (let i = 0; i <= upTo; i++) if (pages[i].type === 'step') n++;
    return n;
  }

  function renderPage() {
    const page = pages[currentPage];
    const inner = $('#cmStepInner', overlay);
    const progressText = $('#cmProgressText', overlay);
    const dots = $('#cmDots', overlay);
    const prevBtn = $('#cmPrev', overlay);
    const nextLabel = $('#cmNextLabel', overlay);
    const nextIcon = $('#cmNextIcon', overlay);
    const nextBtn = $('#cmNext', overlay);

    if (page.type === 'heading') {
      inner.className = 'cook-mode__step-inner cook-mode__step-inner--heading';
      inner.innerHTML = `
        <div class="cook-mode__section-label">${t('cookMode.section')}</div>
        <div class="cook-mode__heading-text">${esc(page.text)}</div>
      `;
      progressText.textContent = `${currentPage + 1} / ${pages.length}`;
    } else {
      const num = stepNumber(currentPage);
      inner.className = 'cook-mode__step-inner';
      inner.innerHTML = `
        <div class="cook-mode__step-num">${t('cookMode.stepOf', num, totalSteps)}</div>
        <div class="cook-mode__step-text">${esc(page.text)}</div>
      `;
      progressText.textContent = t('cookMode.stepOf', num, totalSteps);
    }

    prevBtn.disabled = currentPage === 0;

    const isLast = currentPage === pages.length - 1;
    nextLabel.textContent = isLast ? t('cookMode.finishBtn') : t('cookMode.nextBtn');
    nextIcon.innerHTML = isLast
      ? '<polyline points="20,6 9,17 4,12"/>'
      : '<polyline points="9,18 15,12 9,6"/>';
    nextBtn.classList.toggle('cook-mode__nav-btn--finish', isLast);

    if (pages.length <= 14) {
      dots.innerHTML = pages.map((_, i) =>
        `<button class="cook-mode__dot${i === currentPage ? ' cook-mode__dot--active' : ''}" data-goto="${i}" aria-label="${i + 1}"></button>`
      ).join('');
    } else {
      dots.textContent = `${currentPage + 1} / ${pages.length}`;
      dots.className = 'cook-mode__dots cook-mode__dots--text';
    }
  }

  function goTo(idx) {
    if (idx < 0 || idx >= pages.length) return;
    currentPage = idx;
    renderPage();
  }

  function close() {
    releaseWakeLock();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    overlay.remove();
  }

  async function onVisibilityChange() {
    if (document.visibilityState === 'visible' && !wakeLock) {
      await acquireWakeLock();
    }
  }

  $('#cmExit', overlay).addEventListener('click', close);

  $('#cmPrev', overlay).addEventListener('click', () => goTo(currentPage - 1));
  $('#cmNext', overlay).addEventListener('click', () => {
    if (currentPage === pages.length - 1) close();
    else goTo(currentPage + 1);
  });

  $('#cmDots', overlay).addEventListener('click', e => {
    const btn = e.target.closest('[data-goto]');
    if (btn) goTo(parseInt(btn.dataset.goto, 10));
  });

  $('#cmIngrBtn', overlay).addEventListener('click', () => {
    const panel = $('#cmIngrPanel', overlay);
    panel.hidden = !panel.hidden;
  });

  $('#cmIngrClose', overlay).addEventListener('click', () => {
    $('#cmIngrPanel', overlay).hidden = true;
  });

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentPage + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(currentPage - 1);
    else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibilityChange);

  let touchStartX = 0, touchStartY = 0;
  overlay.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goTo(currentPage + 1);
      else goTo(currentPage - 1);
    }
  }, { passive: true });

  renderPage();
  overlay.tabIndex = -1;
  overlay.focus();
}