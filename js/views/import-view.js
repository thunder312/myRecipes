import { getSetting, addRecipe, getAllRecipes, updateRecipe, deleteRecipe, getAllCookbooks } from '../db.js';
import { processURL, processPDF, processImage, processImages, processText } from '../import.js';
import { $, showToast, categoryChipClass } from '../utils/helpers.js';
import { setImportRunning } from '../utils/auth.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { ApiError } from '../api.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';

const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.txt', '.text', '.md'];

// Module-level batch state – survives view re-renders so the import
// continues in the background when the user switches tabs.
let batchJob = null;
// batchJob = { total, current, currentFileName, results, cancelled, status }

let batchActiveContainer = null;

function appendLiveLog(status, text) {
  if (!batchActiveContainer) return;
  const log = $('#batchLiveLog', batchActiveContainer);
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `batch__live-entry batch__live-entry--${status}`;
  const icon = { pending: '⏳', success: '✓', failed: '✗', skipped: '–', ratelimit: '⏸' }[status] || '·';
  entry.textContent = `${icon} ${text}`;
  log.appendChild(entry);
  entry.scrollIntoView({ block: 'nearest' });
}

function updateBatchProgressDOM() {
  if (!batchJob || !batchActiveContainer) return;
  const bar = $('#batchBar', batchActiveContainer);
  if (!bar) return; // import view not currently visible
  const pct = batchJob.total > 0 ? Math.round((batchJob.current / batchJob.total) * 100) : 0;
  bar.style.width = `${pct}%`;
  $('#batchProgressText', batchActiveContainer).textContent = `${batchJob.current} / ${batchJob.total}`;
  $('#batchCurrentFile', batchActiveContainer).textContent = batchJob.currentFileName;
}

function getFileExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function isImageFile(file) {
  const ext = getFileExtension(file.name);
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
}

function isPdfFile(file) {
  return file.type === 'application/pdf' || getFileExtension(file.name) === '.pdf';
}

function isTextFile(file) {
  const ext = getFileExtension(file.name);
  return ['.txt', '.text', '.md'].includes(ext);
}

export async function render(container) {
  await ensureAuthenticated(container, () => renderImportForm(container));
}

let importCookbooks = [];

async function loadCookbooks() {
  try {
    importCookbooks = await getAllCookbooks();
  } catch {
    importCookbooks = [];
  }
}

function renderCookbookCheckboxes(container) {
  const box = $('#cookbookCheckboxes', container);
  const selector = $('#cookbookSelectorGlobal', container);
  if (!box) return;
  const extra = importCookbooks.filter(cb => cb.id !== 1);
  if (extra.length === 0) {
    if (selector) selector.classList.add('hidden');
    return;
  }
  if (selector) selector.classList.remove('hidden');
  box.innerHTML = extra.map(cb => `
    <label class="assign-item">
      <input type="checkbox" name="importCookbook" value="${cb.id}" />
      <span class="assign-item__title">${escImport(cb.name)}</span>
    </label>
  `).join('');
}

function getSelectedImportCookbookIds(container) {
  return Array.from(container.querySelectorAll('input[name="importCookbook"]:checked'))
    .map(cb => parseInt(cb.value, 10));
}

function escImport(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function renderImportForm(container) {
  batchActiveContainer = container;
  await loadCookbooks();

  container.innerHTML = `
    <div class="import">
      <h1>Rezept importieren</h1>

      <div class="import__tabs">
        <button class="tab tab--active" data-tab="url">URL</button>
        <button class="tab" data-tab="file">PDF / Bild</button>
        <button class="tab" data-tab="text">Text</button>
        <button class="tab" data-tab="batch">Massen-Import</button>
      </div>

      <div class="form-group import__cookbook-selector" id="cookbookSelectorGlobal">
        <label>Zusätzliche Kochbücher (optional)</label>
        <div class="cookbook-checkboxes" id="cookbookCheckboxes"></div>
        <p class="settings__hint">Alle importierten Rezepte werden immer dem Standard-Kochbuch zugeordnet.</p>
      </div>

      <div class="import__panel" id="panel-url">
        <div class="form-group">
          <label for="recipeUrl">Rezept-URL</label>
          <input type="url" id="recipeUrl" class="input" placeholder="https://www.chefkoch.de/rezepte/..." />
        </div>
        <div class="form-group">
          <label for="sourceNoteUrl">Von wem / Woher (optional)</label>
          <input type="text" id="sourceNoteUrl" class="input"
                 placeholder="z. B. Von Oma, Aus dem Koch-Kurs..." />
        </div>
        <label class="import__multi-hint">
          <input type="checkbox" id="multiHintUrl" />
          Enthält mehrere Rezepte
        </label>
        <button class="btn btn--primary" id="btnImportUrl">URL importieren</button>
      </div>

      <div class="import__panel hidden" id="panel-file">
        <div class="form-group">
          <label for="recipeFile">PDF oder Bild hochladen</label>
          <input type="file" id="recipeFile" class="input" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp" />
        </div>
        <div class="import__camera-group" id="cameraGroup">
          <button class="btn btn--secondary" id="btnCamera" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Rezept fotografieren
          </button>
          <input type="file" id="cameraInput" class="hidden" accept="image/*" capture="environment" />
        </div>
        <div class="camera-collector hidden" id="cameraCollector">
          <p class="camera-collector__label">Aufgenommene Seiten:</p>
          <div class="camera-collector__photos" id="cameraPhotos"></div>
          <div class="camera-collector__actions">
            <button class="btn btn--secondary btn--sm" id="btnAddPhoto" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Weitere Seite
            </button>
            <button class="btn btn--primary" id="btnAnalyzePhotos" type="button">Rezept analysieren</button>
            <button class="btn btn--ghost btn--sm" id="btnClearPhotos" type="button">Abbrechen</button>
          </div>
        </div>
        <div class="form-group">
          <label for="sourceNoteFile">Von wem / Woher (optional)</label>
          <input type="text" id="sourceNoteFile" class="input"
                 placeholder="z. B. Von Oma, Aus dem Koch-Kurs..." />
        </div>
        <label class="import__multi-hint">
          <input type="checkbox" id="multiHintFile" />
          Enthält mehrere Rezepte
        </label>
        <button class="btn btn--primary" id="btnImportFile">Datei importieren</button>
      </div>

      <div class="import__panel hidden" id="panel-text">
        <div class="form-group">
          <label for="recipeText">Rezepttext einfügen</label>
          <textarea id="recipeText" class="input input--textarea" rows="10" placeholder="Rezepttext hier einfügen..."></textarea>
        </div>
        <div class="form-group">
          <label for="sourceNoteText">Von wem / Woher (optional)</label>
          <input type="text" id="sourceNoteText" class="input"
                 placeholder="z. B. Von Oma, Aus dem Koch-Kurs..." />
        </div>
        <label class="import__multi-hint">
          <input type="checkbox" id="multiHintText" />
          Enthält mehrere Rezepte
        </label>
        <button class="btn btn--primary" id="btnImportText">Text importieren</button>
      </div>

      <div class="import__panel hidden" id="panel-batch">
        <p class="batch__desc">Wähle einen Ordner aus – alle unterstützten Dateien (PDF, Bilder, Textdateien) werden rekursiv importiert und automatisch kategorisiert.</p>
        <div class="form-group">
          <label for="batchFolder">Ordner auswählen</label>
          <input type="file" id="batchFolder" class="input" webkitdirectory directory multiple />
        </div>
        <div class="batch__file-info hidden" id="batchFileInfo">
          <span id="batchFileCount"></span>
        </div>
        <div class="batch__options">
          <div class="form-group">
            <label for="batchSourceNote">Von wem / Woher (optional, für alle Rezepte)</label>
            <input type="text" id="batchSourceNote" class="input"
                   placeholder="z. B. Von Oma, Aus dem Koch-Kurs..." />
          </div>
          <div class="form-group">
            <label for="batchDelay">Pause zwischen Dateien (Sekunden)</label>
            <input type="number" id="batchDelay" class="input" value="2" min="0" max="30" style="max-width:120px" />
          </div>
        </div>
        <button class="btn btn--primary" id="btnStartBatch">Massen-Import starten</button>
      </div>

      <!-- Single import loading -->
      <div class="import__loading hidden" id="importLoading">
        <div class="spinner"></div>
        <p id="loadingText">Rezept wird analysiert...</p>
      </div>

      <!-- Multi-recipe review -->
      <div class="multi-review hidden" id="multiReview">
        <div class="multi-review__header">
          <h2 id="multiReviewTitle">Mehrere Rezepte erkannt</h2>
          <p class="multi-review__desc" id="multiReviewDesc"></p>
        </div>
        <div class="multi-review__toolbar">
          <button class="btn btn--ghost btn--sm" id="btnSelectAll">Alle auswählen</button>
          <button class="btn btn--ghost btn--sm" id="btnSelectNone">Keine auswählen</button>
        </div>
        <div class="multi-review__list" id="multiList"></div>
        <div class="multi-review__actions">
          <button class="btn btn--primary" id="btnMultiImport">Ausgewählte importieren</button>
          <button class="btn btn--ghost" id="btnMultiCancel">Abbrechen</button>
        </div>
      </div>

      <!-- Single recipe preview -->
      <div class="import__preview hidden" id="importPreview">
        <h2>Vorschau & Bearbeitung</h2>
        <div class="preview-form" id="previewForm"></div>
        <div class="import__preview-actions">
          <button class="btn btn--primary" id="btnSave">Rezept speichern</button>
          <button class="btn btn--ghost" id="btnCancel">Abbrechen</button>
        </div>
      </div>

      <!-- Multi-recipe import progress -->
      <div class="multi-progress hidden" id="multiProgress">
        <h2>Rezepte werden importiert...</h2>
        <div class="batch__progress-bar-wrapper">
          <div class="batch__progress-bar" id="multiBar" style="width:0%"></div>
        </div>
        <p class="batch__progress-text" id="multiProgressText">0 / 0</p>
        <p class="batch__progress-current" id="multiCurrentRecipe"></p>
      </div>

      <!-- Multi-recipe import results -->
      <div class="multi-results hidden" id="multiResults">
        <h2>Import abgeschlossen</h2>
        <div class="multi-results__summary" id="multiSummary"></div>
        <button class="btn btn--primary" id="btnMultiDone">Zur Übersicht</button>
      </div>

      <!-- Batch progress -->
      <div class="batch__progress hidden" id="batchProgress">
        <h2>Massen-Import läuft...</h2>
        <div class="batch__progress-bar-wrapper">
          <div class="batch__progress-bar" id="batchBar" style="width:0%"></div>
        </div>
        <p class="batch__progress-text" id="batchProgressText">0 / 0</p>
        <p class="batch__progress-current" id="batchCurrentFile"></p>
        <div class="batch__live-log" id="batchLiveLog"></div>
        <button class="btn btn--danger" id="btnCancelBatch">Abbrechen</button>
      </div>

      <!-- Batch results -->
      <div class="batch__results hidden" id="batchResults">
        <h2>Import abgeschlossen</h2>
        <div class="batch__summary" id="batchSummary"></div>
        <div class="dup-section hidden" id="dupSection"></div>
        <div class="batch__log" id="batchLog"></div>
        <div class="batch__retry hidden" id="batchRetry">
          <h3>Fehlgeschlagene Dateien erneut importieren</h3>
          <div class="batch__retry-list" id="batchRetryList"></div>
          <button class="btn btn--secondary" id="btnBatchRetry">Ausgewählte erneut importieren</button>
        </div>
        <button class="btn btn--primary" id="btnBatchDone">Zur Übersicht</button>
      </div>
    </div>
  `;

  // Render cookbook checkboxes immediately (cookbooks already loaded via await)
  renderCookbookCheckboxes(container);

  // Tabs
  const allHideables = ['#importLoading', '#importPreview', '#multiReview', '#multiProgress', '#multiResults', '#batchProgress', '#batchResults'];
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
      container.querySelectorAll('.import__panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('tab--active');
      $(`#panel-${tab.dataset.tab}`, container).classList.remove('hidden');
      allHideables.forEach(sel => $(sel, container).classList.add('hidden'));
    });
  });

  let currentData = null;       // single recipe data for preview
  let currentMultiData = null;  // array of recipe data for multi-review

  // --- Single import handlers ---

  $('#btnImportUrl', container).addEventListener('click', async () => {
    const url = $('#recipeUrl', container).value.trim();
    if (!url) { showToast('Bitte URL eingeben.', 'warning'); return; }
    const multiHint = $('#multiHintUrl', container).checked;
    const sourceNote = $('#sourceNoteUrl', container).value.trim();
    await doImport(() => processURL(url, { multiHint }), sourceNote);
  });

  $('#btnImportFile', container).addEventListener('click', async () => {
    const file = $('#recipeFile', container).files[0];
    if (!file) { showToast('Bitte Datei auswählen.', 'warning'); return; }
    const multiHint = $('#multiHintFile', container).checked;
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const sourceNote = $('#sourceNoteFile', container).value.trim();
    await doImport(() => isPdf ? processPDF(file, { multiHint }) : processImage(file, { multiHint }), sourceNote);
  });

  // Camera button – triggers hidden file input with capture="environment"
  const cameraBtn = $('#btnCamera', container);
  const cameraInput = $('#cameraInput', container);
  const cameraGroup = $('#cameraGroup', container);
  const cameraCollector = $('#cameraCollector', container);
  const cameraPhotos = $('#cameraPhotos', container);

  // Show camera button only on devices with a camera (touch devices)
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) {
    cameraGroup.style.display = 'none';
  }

  let capturedPhotos = [];

  function buildPhotoThumbnails() {
    cameraPhotos.innerHTML = '';
    capturedPhotos.forEach((file, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'camera-collector__photo';
      const url = URL.createObjectURL(file);
      thumb.innerHTML = `
        <img src="${url}" alt="Seite ${idx + 1}" />
        <span class="camera-collector__photo-num">${idx + 1}</span>
        <button class="camera-collector__remove" data-idx="${idx}" title="Entfernen">&times;</button>
      `;
      cameraPhotos.appendChild(thumb);
    });
  }

  function resetCameraCollector() {
    capturedPhotos = [];
    cameraPhotos.innerHTML = '';
    cameraCollector.classList.add('hidden');
    cameraGroup.classList.remove('hidden');
  }

  cameraBtn.addEventListener('click', () => cameraInput.click());

  cameraInput.addEventListener('change', () => {
    const file = cameraInput.files[0];
    if (!file) return;
    capturedPhotos.push(file);
    buildPhotoThumbnails();
    cameraCollector.classList.remove('hidden');
    cameraGroup.classList.add('hidden');
    cameraInput.value = '';
  });

  cameraPhotos.addEventListener('click', (e) => {
    const btn = e.target.closest('.camera-collector__remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    capturedPhotos.splice(idx, 1);
    if (capturedPhotos.length === 0) {
      resetCameraCollector();
    } else {
      buildPhotoThumbnails();
    }
  });

  $('#btnAddPhoto', container).addEventListener('click', () => cameraInput.click());

  $('#btnAnalyzePhotos', container).addEventListener('click', async () => {
    if (capturedPhotos.length === 0) return;
    const files = [...capturedPhotos];
    const sourceNote = $('#sourceNoteFile', container).value.trim();
    resetCameraCollector();
    await doImport(() => processImages(files), sourceNote);
  });

  $('#btnClearPhotos', container).addEventListener('click', () => {
    resetCameraCollector();
  });

  $('#btnImportText', container).addEventListener('click', async () => {
    const text = $('#recipeText', container).value.trim();
    if (!text) { showToast('Bitte Text eingeben.', 'warning'); return; }
    const multiHint = $('#multiHintText', container).checked;
    const sourceNote = $('#sourceNoteText', container).value.trim();
    await doImport(() => processText(text, { multiHint }), sourceNote);
  });

  async function doImport(processFn, sourceNote = '') {
    const apiKey = await getSetting('apiKey');
    if (!apiKey) {
      showToast('Bitte zuerst den API-Key in den Einstellungen hinterlegen.', 'warning');
      return;
    }

    const loading = $('#importLoading', container);
    allHideables.forEach(sel => $(sel, container).classList.add('hidden'));
    loading.classList.remove('hidden');
    setImportRunning(true);

    try {
      const results = await processFn(); // always an array, with ._filtered count
      results.forEach(r => {
        r.sourceNote = sourceNote || '';
        if (r.sourceType === 'url' && r.sourceRef) {
          r.importNotes = (r.importNotes ? r.importNotes + '\n' : '') + `Quelle: ${r.sourceRef}`;
        }
      });
      const filteredCount = results._filtered || 0;

      if (results.length === 0) {
        const msg = filteredCount > 0
          ? `Keine brauchbaren Rezepte erkannt (${filteredCount} ungültige Einträge gefiltert).`
          : 'Keine Rezepte erkannt. Bitte versuche es mit einer anderen Quelle.';
        showToast(msg, 'warning', { duration: 5000 });
        return;
      }

      if (results.length === 1 && filteredCount === 0) {
        // Single recipe → show preview
        currentData = results[0];
        showPreview(currentData);
      } else {
        // Multiple recipes or some filtered → show multi-review
        currentMultiData = results;
        showMultiReview(results, filteredCount);
      }
    } catch (err) {
      if (err instanceof ApiError && err.isHtml) {
        showToast(err.message, 'error', { html: true, duration: 6000 });
      } else {
        showToast(`Fehler: ${err.message}`, 'error');
      }
    } finally {
      loading.classList.add('hidden');
      setImportRunning(false);
    }
  }

  // --- Single recipe preview ---

  function showPreview(data) {
    const preview = $('#importPreview', container);
    const form = $('#previewForm', container);
    preview.classList.remove('hidden');
    renderRecipeForm(form, data);
  }

  $('#btnSave', container).addEventListener('click', async () => {
    if (!currentData) return;

    const form = $('#previewForm', container);
    const formData = readRecipeForm(form);
    const recipe = {
      ...formData,
      sourceType: currentData.sourceType,
      sourceRef: currentData.sourceRef,
      notes: formData.importNotes
        ? [{ date: new Date().toISOString(), text: formData.importNotes }]
        : [],
      cookedDates: [],
      cookedCount: 0
    };
    delete recipe.importNotes;

    recipe.thumbnailBlob = null;
    const extraCookbookIds = getSelectedImportCookbookIds(container);

    try {
      await addRecipe(recipe, extraCookbookIds);
      showToast(`"${recipe.title}" erfolgreich importiert!`, 'success');
      currentData = null;
      window.location.hash = '#overview';
    } catch (err) {
      showToast(`Fehler beim Speichern: ${err.message}`, 'error');
    }
  });

  $('#btnCancel', container).addEventListener('click', () => {
    currentData = null;
    $('#importPreview', container).classList.add('hidden');
  });

  // --- Multi-recipe review with accordion ---

  function showMultiReview(recipes, filteredCount) {
    const reviewEl = $('#multiReview', container);
    reviewEl.classList.remove('hidden');

    const titleEl = $('#multiReviewTitle', container);
    titleEl.textContent = `${recipes.length} Rezept${recipes.length !== 1 ? 'e' : ''} erkannt`;

    const descEl = $('#multiReviewDesc', container);
    let desc = 'Prüfe die erkannten Rezepte, bearbeite sie bei Bedarf und wähle aus, welche importiert werden sollen.';
    if (filteredCount > 0) {
      desc += ` (${filteredCount} ungültige Eintr${filteredCount !== 1 ? 'äge' : 'ag'} wurden automatisch gefiltert)`;
    }
    descEl.textContent = desc;

    const listEl = $('#multiList', container);
    listEl.innerHTML = recipes.map((r, idx) => `
      <div class="review-card" data-review-idx="${idx}">
        <div class="review-card__header">
          <label class="review-card__select">
            <input type="checkbox" checked data-multi-idx="${idx}" />
          </label>
          <div class="review-card__summary" data-toggle-idx="${idx}">
            <strong class="review-card__title">${esc(r.title || 'Unbekanntes Rezept')}</strong>
            <span class="review-card__meta">
              ${r.category ? `<span class="chip ${categoryChipClass(r.category)} chip--sm">${esc(r.category)}</span>` : ''}
              ${r.origin ? `<span class="chip chip--origin chip--sm">${esc(r.origin)}</span>` : ''}
              ${r.mainIngredient ? `<span class="chip chip--sm">${esc(r.mainIngredient)}</span>` : ''}
            </span>
          </div>
          <button class="review-card__toggle" data-toggle-idx="${idx}" title="Details ein-/ausklappen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        <div class="review-card__body hidden" id="reviewBody-${idx}">
          <div class="review-card__form" id="reviewForm-${idx}"></div>
        </div>
      </div>
    `).join('');

    // Initialize forms and toggle handlers
    recipes.forEach((r, idx) => {
      const formEl = $(`#reviewForm-${idx}`, container);
      renderRecipeForm(formEl, r);
    });

    // Toggle accordion
    container.querySelectorAll('[data-toggle-idx]').forEach(el => {
      el.addEventListener('click', (e) => {
        // Don't toggle on checkbox click
        if (e.target.tagName === 'INPUT') return;
        const idx = el.dataset.toggleIdx;
        const body = $(`#reviewBody-${idx}`, container);
        const card = body.closest('.review-card');
        body.classList.toggle('hidden');
        card.classList.toggle('review-card--open');
      });
    });
  }

  // Select all / none
  $('#btnSelectAll', container).addEventListener('click', () => {
    container.querySelectorAll('#multiList input[type="checkbox"]').forEach(cb => cb.checked = true);
  });

  $('#btnSelectNone', container).addEventListener('click', () => {
    container.querySelectorAll('#multiList input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  $('#btnMultiCancel', container).addEventListener('click', () => {
    currentMultiData = null;
    $('#multiReview', container).classList.add('hidden');
  });

  $('#btnMultiImport', container).addEventListener('click', async () => {
    if (!currentMultiData) return;

    // Collect selected recipes with edited form data
    const checkboxes = container.querySelectorAll('#multiList input[type="checkbox"]');
    const selectedRecipes = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        const idx = parseInt(cb.dataset.multiIdx, 10);
        const formEl = $(`#reviewForm-${idx}`, container);
        const edited = readRecipeForm(formEl);
        // Merge edited fields with original source data
        selectedRecipes.push({
          ...edited,
          recipeText: currentMultiData[idx].recipeText,
          sourceType: currentMultiData[idx].sourceType,
          sourceRef: currentMultiData[idx].sourceRef
        });
      }
    });

    if (selectedRecipes.length === 0) {
      showToast('Bitte mindestens ein Rezept auswählen.', 'warning');
      return;
    }

    const extraCookbookIds = getSelectedImportCookbookIds(container);

    // Import all selected with progress
    $('#multiReview', container).classList.add('hidden');
    const progressEl = $('#multiProgress', container);
    progressEl.classList.remove('hidden');
    setImportRunning(true);

    const total = selectedRecipes.length;
    let success = 0;
    let failed = 0;
    const imported = [];
    const errors = [];

    for (let i = 0; i < selectedRecipes.length; i++) {
      const r = selectedRecipes[i];
      const pct = Math.round(((i + 1) / total) * 100);
      $('#multiBar', container).style.width = `${pct}%`;
      $('#multiProgressText', container).textContent = `${i + 1} / ${total}`;
      $('#multiCurrentRecipe', container).textContent = r.title || 'Unbekannt';

      try {
        const recipe = {
          title: r.title || 'Unbekanntes Rezept',
          category: r.category || '',
          origin: r.origin || '',
          prepTime: r.prepTime || null,
          mainIngredient: r.mainIngredient || '',
          sides: r.sides || [],
          tags: r.tags || [],
          ingredients: r.ingredients || [],
          description: r.description || '',
          recipeText: r.recipeText || '',
          servings: r.servings || null,
          difficulty: r.difficulty || '',
          sourceType: r.sourceType || 'text',
          sourceRef: r.sourceRef || '',
          sourceNote: r.sourceNote || '',
          notes: r.importNotes
            ? [{ date: new Date().toISOString(), text: r.importNotes }]
            : [],
          cookedDates: [],
          cookedCount: 0
        };

        recipe.thumbnailBlob = null;

        await addRecipe(recipe, extraCookbookIds);
        imported.push(recipe.title);
        success++;
      } catch (err) {
        errors.push({ title: r.title, reason: err.message });
        failed++;
      }
    }

    // Show results
    progressEl.classList.add('hidden');
    const resultsEl = $('#multiResults', container);
    resultsEl.classList.remove('hidden');

    const summaryEl = $('#multiSummary', container);
    let html = `<div class="batch__summary-grid">
      <div class="batch__summary-item batch__summary-item--success">
        <span class="batch__summary-value">${success}</span>
        <span class="batch__summary-label">Erfolgreich</span>
      </div>
      <div class="batch__summary-item batch__summary-item--failed">
        <span class="batch__summary-value">${failed}</span>
        <span class="batch__summary-label">Fehlgeschlagen</span>
      </div>
    </div>`;

    if (imported.length > 0) {
      html += `<div class="multi-results__list"><h4>Importierte Rezepte:</h4><ul>${imported.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
    }
    if (errors.length > 0) {
      html += `<div class="multi-results__list multi-results__list--errors"><h4>Fehler:</h4><ul>${errors.map(e => `<li><strong>${esc(e.title)}</strong>: ${esc(e.reason)}</li>`).join('')}</ul></div>`;
    }

    summaryEl.innerHTML = html;
    currentMultiData = null;
    setImportRunning(false);
  });

  $('#btnMultiDone', container).addEventListener('click', () => {
    window.location.hash = '#overview';
  });

  // --- Batch import ---

  $('#batchFolder', container).addEventListener('change', () => {
    const files = getFilteredBatchFiles();
    const info = $('#batchFileInfo', container);
    if (files.length > 0) {
      info.classList.remove('hidden');
      $('#batchFileCount', container).textContent = `${files.length} unterstützte Datei${files.length !== 1 ? 'en' : ''} gefunden (${SUPPORTED_EXTENSIONS.join(', ')})`;
    } else {
      info.classList.remove('hidden');
      $('#batchFileCount', container).textContent = 'Keine unterstützten Dateien im gewählten Ordner gefunden.';
    }
  });

  function getFilteredBatchFiles() {
    const input = $('#batchFolder', container);
    if (!input.files) return [];
    return Array.from(input.files).filter(f => {
      const ext = getFileExtension(f.name);
      return SUPPORTED_EXTENSIONS.includes(ext) && f.size > 0;
    });
  }

  $('#btnStartBatch', container).addEventListener('click', async () => {
    if (batchJob && batchJob.status === 'running') {
      showToast('Ein Import läuft bereits im Hintergrund.', 'warning');
      return;
    }

    const apiKey = await getSetting('apiKey');
    if (!apiKey) {
      showToast('Bitte zuerst den API-Key in den Einstellungen hinterlegen.', 'warning');
      return;
    }

    const files = getFilteredBatchFiles();
    if (files.length === 0) {
      showToast('Keine unterstützten Dateien gefunden.', 'warning');
      return;
    }

    const delay = Math.max(0, parseInt($('#batchDelay', container).value) || 2) * 1000;
    files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));

    batchJob = {
      total: files.length,
      current: 0,
      currentFileName: '',
      results: { success: [], failed: [], skipped: [] },
      cancelled: false,
      status: 'running',
      importedIds: [],
      duplicates: [],
      sourceNote: $('#batchSourceNote', container).value.trim(),
      extraCookbookIds: getSelectedImportCookbookIds(container),
      delay,
    };

    $('#panel-batch', container).classList.add('hidden');
    $('#batchProgress', container).classList.remove('hidden');
    $('#batchResults', container).classList.add('hidden');
    setImportRunning(true);

    await processBatchFiles(files, delay);

    batchJob.status = batchJob.cancelled ? 'cancelled' : 'completed';
    setImportRunning(false);

    try {
      const allRecipes = await getAllRecipes();
      batchJob.duplicates = findDuplicates(allRecipes, batchJob.importedIds);
    } catch { batchJob.duplicates = []; }

    if ($('#batchProgress', batchActiveContainer)) {
      showBatchResults(batchActiveContainer, batchJob.results, batchJob.total);
    }
  });

  $('#btnCancelBatch', container).addEventListener('click', () => {
    if (batchJob) batchJob.cancelled = true;
    $('#btnCancelBatch', container).disabled = true;
    $('#btnCancelBatch', container).textContent = 'Wird abgebrochen...';
  });

  $('#btnBatchDone', container).addEventListener('click', () => {
    batchJob = null;
    window.location.hash = '#overview';
  });

  // === Restore batch UI if an import is running in the background or just completed ===
  if (batchJob) {
    container.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
    container.querySelectorAll('.import__panel').forEach(p => p.classList.add('hidden'));
    container.querySelector('[data-tab="batch"]').classList.add('tab--active');
    allHideables.forEach(sel => $(sel, container).classList.add('hidden'));

    if (batchJob.status === 'running') {
      $('#batchProgress', container).classList.remove('hidden');
      updateBatchProgressDOM();
    } else {
      showBatchResults(container, batchJob.results, batchJob.total);
    }
  }
}

async function processBatchFiles(files, delay) {
  const total = files.length;
  batchJob.total = total;
  batchJob.current = 0;

  for (let i = 0; i < files.length; i++) {
    if (batchJob.cancelled) {
      for (let j = i; j < files.length; j++) {
        batchJob.results.skipped.push({ file: files[j].webkitRelativePath || files[j].name, reason: 'Abgebrochen' });
      }
      break;
    }

    const file = files[i];
    const filePath = file.webkitRelativePath || file.name;

    batchJob.current = i + 1;
    batchJob.currentFileName = filePath;
    updateBatchProgressDOM();

    console.log(`[Batch] ${i + 1}/${total} Starte: ${filePath}`);
    appendLiveLog('pending', `${i + 1}/${total}: ${filePath}`);

    try {
      let analysisResults;

      if (isPdfFile(file)) {
        analysisResults = await processPDF(file);
      } else if (isImageFile(file)) {
        analysisResults = await processImage(file);
      } else if (isTextFile(file)) {
        const text = await file.text();
        if (text.trim().length < 20) {
          batchJob.results.skipped.push({ file: filePath, reason: 'Zu wenig Text' });
          appendLiveLog('skipped', `${i + 1}/${total}: ${filePath} – Zu wenig Text`);
          continue;
        }
        analysisResults = await processText(text);
        for (const r of analysisResults) r.sourceRef = file.name;
      } else {
        batchJob.results.skipped.push({ file: filePath, reason: 'Nicht unterstütztes Format' });
        appendLiveLog('skipped', `${i + 1}/${total}: ${filePath} – Nicht unterstützt`);
        continue;
      }

      if (analysisResults.length === 0) {
        const filtered = analysisResults._filtered || 0;
        const skipReason = filtered > 0 ? `${filtered} ungültige Einträge gefiltert` : 'Kein Rezept erkannt';
        const skippedEntry = { file: filePath, reason: skipReason };
        if (skipReason === 'Kein Rezept erkannt') skippedEntry.fileObj = file;
        batchJob.results.skipped.push(skippedEntry);
        appendLiveLog('skipped', `${i + 1}/${total}: ${filePath} – ${skipReason}`);
        continue;
      }

      for (const analysisResult of analysisResults) {
        const recipe = {
          title: analysisResult.title || file.name,
          category: analysisResult.category || '',
          origin: analysisResult.origin || '',
          prepTime: analysisResult.prepTime || null,
          mainIngredient: analysisResult.mainIngredient || '',
          sides: analysisResult.sides || [],
          tags: analysisResult.tags || [],
          ingredients: analysisResult.ingredients || [],
          description: analysisResult.description || '',
          recipeText: analysisResult.recipeText || '',
          servings: analysisResult.servings || null,
          difficulty: analysisResult.difficulty || '',
          sourceType: analysisResult.sourceType || 'file',
          sourceRef: analysisResult.sourceRef || filePath,
          sourceNote: batchJob.sourceNote || '',
          notes: analysisResult.importNotes
            ? [{ date: new Date().toISOString(), text: analysisResult.importNotes }]
            : [],
          cookedDates: [],
          cookedCount: 0
        };
        recipe.thumbnailBlob = null;
        const newId = await addRecipe(recipe, batchJob.extraCookbookIds || []);
        batchJob.results.success.push({ file: filePath, title: recipe.title, id: newId });
        batchJob.importedIds.push(newId);
        appendLiveLog('success', `${i + 1}/${total}: ${recipe.title} (${filePath})`);
      }
    } catch (err) {
      const isRateLimit = err.isRateLimit === true || err.status === 429 || err.status === 529;
      const reason = err.message?.replace(/<[^>]+>/g, '') || 'Unbekannter Fehler';
      console.error(`[Batch] ${i + 1}/${total} Fehler (HTTP ${err.status ?? '–'}):`, filePath, reason);
      batchJob.results.failed.push({ file: filePath, fileObj: file, reason });
      appendLiveLog('failed', `${i + 1}/${total}: ${filePath} – ${reason}`);

      if (isRateLimit) {
        console.warn('[Batch] Rate-Limit erkannt – warte 60 Sekunden vor dem nächsten Versuch...');
        appendLiveLog('ratelimit', 'Rate-Limit – 60s Pause vor dem nächsten Versuch...');
        batchJob.currentFileName = `⏸ Rate-Limit – 60s Pause... (${filePath})`;
        updateBatchProgressDOM();
        await new Promise(resolve => setTimeout(resolve, 60_000));
        batchJob.currentFileName = filePath;
      }
    }

    if (i < files.length - 1 && !batchJob.cancelled && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function showBatchResults(container, results, total) {
  $('#batchProgress', container).classList.add('hidden');
  const resultsEl = $('#batchResults', container);
  resultsEl.classList.remove('hidden');

  const summaryEl = $('#batchSummary', container);
  summaryEl.innerHTML = `
    <div class="batch__summary-grid">
      <div class="batch__summary-item batch__summary-item--success">
        <span class="batch__summary-value">${results.success.length}</span>
        <span class="batch__summary-label">Erfolgreich</span>
      </div>
      <div class="batch__summary-item batch__summary-item--failed">
        <span class="batch__summary-value">${results.failed.length}</span>
        <span class="batch__summary-label">Fehlgeschlagen</span>
      </div>
      <div class="batch__summary-item batch__summary-item--skipped">
        <span class="batch__summary-value">${results.skipped.length}</span>
        <span class="batch__summary-label">Übersprungen</span>
      </div>
      <div class="batch__summary-item">
        <span class="batch__summary-value">${total}</span>
        <span class="batch__summary-label">Dateien</span>
      </div>
    </div>
  `;

  const logEl = $('#batchLog', container);
  let logHtml = '';

  if (results.success.length > 0) {
    logHtml += '<details open><summary class="batch__log-heading batch__log-heading--success">Erfolgreich importiert</summary><ul class="batch__log-list">';
    results.success.forEach(r => {
      logHtml += `<li class="batch__log-item batch__log-item--success"><strong>${esc(r.title)}</strong><br><small>${esc(r.file)}</small></li>`;
    });
    logHtml += '</ul></details>';
  }

  if (results.failed.length > 0) {
    logHtml += '<details open><summary class="batch__log-heading batch__log-heading--failed">Fehlgeschlagen</summary><ul class="batch__log-list">';
    results.failed.forEach(r => {
      logHtml += `<li class="batch__log-item batch__log-item--failed"><strong>${esc(r.file)}</strong><br><small>${esc(r.reason)}</small></li>`;
    });
    logHtml += '</ul></details>';
  }

  if (results.skipped.length > 0) {
    logHtml += '<details><summary class="batch__log-heading batch__log-heading--skipped">Übersprungen</summary><ul class="batch__log-list">';
    results.skipped.forEach(r => {
      logHtml += `<li class="batch__log-item batch__log-item--skipped"><strong>${esc(r.file)}</strong><br><small>${esc(r.reason)}</small></li>`;
    });
    logHtml += '</ul></details>';
  }

  logEl.innerHTML = logHtml;

  if (batchJob?.duplicates?.length > 0) {
    showDuplicates(container);
  }

  // --- Retry section ---
  const failedRetryable = results.failed.filter(r => r.fileObj);
  const noRecipeRetryable = results.skipped.filter(r => r.fileObj && r.reason === 'Kein Rezept erkannt');

  if (failedRetryable.length > 0 || noRecipeRetryable.length > 0) {
    const retrySection = $('#batchRetry', container);
    const retryList = $('#batchRetryList', container);
    retrySection.classList.remove('hidden');

    let listHtml = '';

    if (failedRetryable.length > 0) {
      listHtml += `<p class="batch__retry-group-label">Fehlgeschlagen (${failedRetryable.length})</p>`;
      failedRetryable.forEach((r, idx) => {
        listHtml += `<label class="batch__retry-item">
          <input type="checkbox" data-retry-idx="f${idx}" checked />
          <span class="batch__retry-file">${esc(r.file)}</span>
          <span class="batch__retry-reason">${esc(r.reason)}</span>
        </label>`;
      });
    }

    if (noRecipeRetryable.length > 0) {
      listHtml += `<p class="batch__retry-group-label">Kein Rezept erkannt (${noRecipeRetryable.length}) – optional</p>`;
      noRecipeRetryable.forEach((r, idx) => {
        listHtml += `<label class="batch__retry-item">
          <input type="checkbox" data-retry-idx="s${idx}" />
          <span class="batch__retry-file">${esc(r.file)}</span>
        </label>`;
      });
    }

    retryList.innerHTML = listHtml;

    $('#btnBatchRetry', container).addEventListener('click', async () => {
      const selectedFiles = [];
      retryList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const idx = cb.dataset.retryIdx;
        if (idx.startsWith('f')) selectedFiles.push(failedRetryable[parseInt(idx.slice(1))].fileObj);
        else selectedFiles.push(noRecipeRetryable[parseInt(idx.slice(1))].fileObj);
      });

      if (selectedFiles.length === 0) {
        showToast('Keine Dateien ausgewählt.', 'warning');
        return;
      }

      const delay = batchJob.delay ?? 2000;
      batchJob = {
        ...batchJob,
        total: selectedFiles.length,
        current: 0,
        currentFileName: '',
        results: { success: [], failed: [], skipped: [] },
        cancelled: false,
        status: 'running',
        importedIds: [],
        duplicates: [],
      };

      $('#batchResults', container).classList.add('hidden');
      const liveLog = $('#batchLiveLog', container);
      if (liveLog) liveLog.innerHTML = '';
      $('#batchProgress', container).classList.remove('hidden');
      setImportRunning(true);

      await processBatchFiles(selectedFiles, delay);

      batchJob.status = batchJob.cancelled ? 'cancelled' : 'completed';
      setImportRunning(false);

      try {
        const allRecipes = await getAllRecipes();
        batchJob.duplicates = findDuplicates(allRecipes, batchJob.importedIds);
      } catch { batchJob.duplicates = []; }

      if ($('#batchProgress', batchActiveContainer)) {
        showBatchResults(batchActiveContainer, batchJob.results, selectedFiles.length);
      }
    });
  }
}

function normTitle(s) { return (s || '').trim().toLowerCase(); }

function ingredientOverlap(a, b) {
  if (!a?.length || !b?.length) return 0;
  const na = a.map(s => s.trim().toLowerCase());
  const nb = b.map(s => s.trim().toLowerCase());
  const matches = na.filter(i => nb.some(j => j.includes(i) || i.includes(j))).length;
  return matches / Math.max(na.length, nb.length);
}

function areDuplicates(r1, r2) {
  if (normTitle(r1.title) !== normTitle(r2.title)) return false;
  return ingredientOverlap(r1.ingredients, r2.ingredients) >= 0.4;
}

function findDuplicates(allRecipes, importedIds) {
  const importedSet = new Set(importedIds);
  const newRecipes = allRecipes.filter(r => importedSet.has(r.id));
  const markedNew = new Set();
  const result = [];
  for (const newR of newRecipes) {
    if (markedNew.has(newR.id)) continue;
    for (const other of allRecipes) {
      if (other.id === newR.id) continue;
      const ov = ingredientOverlap(newR.ingredients, other.ingredients);
      if (areDuplicates(newR, other)) {
        result.push({ newRecipe: newR, existingRecipe: other, overlap: ov });
        markedNew.add(newR.id);
        break;
      }
    }
  }
  return result;
}

function showDuplicates(container) {
  const section = $('#dupSection', container);
  if (!section || !batchJob?.duplicates?.length) return;
  section.classList.remove('hidden');

  const count = batchJob.duplicates.length;
  let html = `<div class="dup-section__heading">⚠ ${count} mögliche${count !== 1 ? '' : 's'} Duplikat${count !== 1 ? 'e' : ''} gefunden</div>`;

  batchJob.duplicates.forEach(({ newRecipe: newR, existingRecipe: existR, overlap: ov }, idx) => {
    html += `
    <div class="dup-card" data-dup-id="${idx}">
      <div class="dup-card__header">
        <span class="dup-card__title">„${esc(newR.title)}"</span>
        <span class="dup-card__overlap">${Math.round(ov * 100)} % Zutaten-Übereinstimmung</span>
      </div>
      <div class="dup-card__cols">
        <div class="dup-card__col">
          <div class="dup-card__col-label">Neu importiert</div>
          <div class="dup-card__col-title">${esc(newR.title)}</div>
          <div class="dup-card__col-meta">${esc(newR.category || '')} · ${esc(newR.origin || '')}</div>
          <div class="dup-card__col-ing">${esc((newR.ingredients || []).slice(0, 4).join(', '))}${(newR.ingredients || []).length > 4 ? ' …' : ''}</div>
        </div>
        <div class="dup-card__col">
          <div class="dup-card__col-label">Bereits vorhanden</div>
          <div class="dup-card__col-title">${esc(existR.title)}</div>
          <div class="dup-card__col-meta">${esc(existR.category || '')} · ${esc(existR.origin || '')}</div>
          <div class="dup-card__col-ing">${esc((existR.ingredients || []).slice(0, 4).join(', '))}${(existR.ingredients || []).length > 4 ? ' …' : ''}</div>
        </div>
      </div>
      <div class="dup-card__actions">
        <button class="btn btn--sm btn--secondary" data-dup-rename="${idx}">Namen ändern</button>
        <button class="btn btn--sm btn--danger"    data-dup-del-old="${idx}">Altes löschen</button>
        <button class="btn btn--sm btn--ghost"     data-dup-del-new="${idx}">Neues löschen</button>
      </div>
      <div class="dup-card__rename hidden" id="dupRenameForm-${idx}">
        <input type="text" class="input" value="${esc(newR.title)}" id="dupRenameInput-${idx}" />
        <button class="btn btn--sm btn--primary" data-dup-rename-save="${idx}">Speichern</button>
        <button class="btn btn--sm btn--ghost"   data-dup-rename-cancel="${idx}">Abbrechen</button>
      </div>
    </div>`;
  });

  section.innerHTML = html;

  section.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.dupRename !== undefined) {
      const idx = parseInt(btn.dataset.dupRename, 10);
      section.querySelector(`#dupRenameForm-${idx}`)?.classList.remove('hidden');
      return;
    }

    if (btn.dataset.dupRenameCancel !== undefined) {
      const idx = parseInt(btn.dataset.dupRenameCancel, 10);
      section.querySelector(`#dupRenameForm-${idx}`)?.classList.add('hidden');
      return;
    }

    if (btn.dataset.dupRenameSave !== undefined) {
      const idx = parseInt(btn.dataset.dupRenameSave, 10);
      const dup = batchJob.duplicates[idx];
      const input = section.querySelector(`#dupRenameInput-${idx}`);
      const newTitle = input?.value.trim();
      if (!newTitle) { showToast('Bitte einen Namen eingeben.', 'warning'); return; }
      try {
        await updateRecipe({ ...dup.newRecipe, title: newTitle });
        removeDupCard(section, idx);
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
      return;
    }

    if (btn.dataset.dupDelOld !== undefined) {
      const idx = parseInt(btn.dataset.dupDelOld, 10);
      const dup = batchJob.duplicates[idx];
      try {
        await deleteRecipe(dup.existingRecipe.id);
        removeDupCard(section, idx);
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
      return;
    }

    if (btn.dataset.dupDelNew !== undefined) {
      const idx = parseInt(btn.dataset.dupDelNew, 10);
      const dup = batchJob.duplicates[idx];
      try {
        await deleteRecipe(dup.newRecipe.id);
        removeDupCard(section, idx);
      } catch (err) {
        showToast(`Fehler: ${err.message}`, 'error');
      }
      return;
    }
  });
}

function removeDupCard(section, idx) {
  const card = section.querySelector(`[data-dup-id="${idx}"]`);
  if (card) card.remove();
  if (!section.querySelector('.dup-card')) {
    section.innerHTML += `<p class="dup-section__done">✓ Alle Duplikate geprüft</p>`;
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
