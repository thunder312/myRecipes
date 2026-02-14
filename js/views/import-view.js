import { getSetting } from '../db.js';
import { addRecipe } from '../db.js';
import { processURL, processPDF, processImage, processText } from '../import.js';
import { generateRecipePDF } from '../pdf-generator.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { $, showToast } from '../utils/helpers.js';
import { isAuthenticated, setAuthenticated } from '../utils/auth.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';

const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.txt', '.text', '.md'];

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
  const passwordHash = await getSetting('passwordHash');

  if (!passwordHash) {
    renderSetPassword(container);
    return;
  }

  if (!isAuthenticated()) {
    renderLogin(container, passwordHash);
    return;
  }

  renderImportForm(container);
}

function renderSetPassword(container) {
  container.innerHTML = `
    <div class="import">
      <h1>Import-Passwort festlegen</h1>
      <p>Beim ersten Mal musst du ein Passwort festlegen, das den Import schützt.</p>
      <div class="form-group">
        <label for="newPw">Neues Passwort</label>
        <input type="password" id="newPw" class="input" placeholder="Passwort" />
      </div>
      <div class="form-group">
        <label for="confirmPw">Passwort bestätigen</label>
        <input type="password" id="confirmPw" class="input" placeholder="Passwort bestätigen" />
      </div>
      <button class="btn btn--primary" id="btnSetPw">Passwort setzen</button>
    </div>
  `;

  $('#btnSetPw', container).addEventListener('click', async () => {
    const pw = $('#newPw', container).value;
    const confirm = $('#confirmPw', container).value;
    if (!pw || pw.length < 4) {
      showToast('Passwort muss mindestens 4 Zeichen haben.', 'warning');
      return;
    }
    if (pw !== confirm) {
      showToast('Passwörter stimmen nicht überein.', 'warning');
      return;
    }
    const { setSetting } = await import('../db.js');
    await setSetting('passwordHash', await hashPassword(pw));
    setAuthenticated(true);
    showToast('Passwort gesetzt!', 'success');
    render(container);
  });
}

function renderLogin(container, passwordHash) {
  container.innerHTML = `
    <div class="import">
      <h1>Rezept importieren</h1>
      <p>Bitte Passwort eingeben, um den Import zu öffnen.</p>
      <div class="form-group">
        <input type="password" id="loginPw" class="input" placeholder="Passwort" />
        <button class="btn btn--primary" id="btnLogin">Entsperren</button>
      </div>
    </div>
  `;

  const doLogin = async () => {
    const pw = $('#loginPw', container).value;
    if (await verifyPassword(pw, passwordHash)) {
      setAuthenticated(true);
      render(container);
    } else {
      showToast('Falsches Passwort.', 'error');
    }
  };

  $('#btnLogin', container).addEventListener('click', doLogin);
  $('#loginPw', container).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

function renderImportForm(container) {
  container.innerHTML = `
    <div class="import">
      <h1>Rezept importieren</h1>

      <div class="import__tabs">
        <button class="tab tab--active" data-tab="url">URL</button>
        <button class="tab" data-tab="file">PDF / Bild</button>
        <button class="tab" data-tab="text">Text</button>
        <button class="tab" data-tab="batch">Massen-Import</button>
      </div>

      <div class="import__panel" id="panel-url">
        <div class="form-group">
          <label for="recipeUrl">Rezept-URL</label>
          <input type="url" id="recipeUrl" class="input" placeholder="https://www.chefkoch.de/rezepte/..." />
        </div>
        <button class="btn btn--primary" id="btnImportUrl">URL importieren</button>
      </div>

      <div class="import__panel hidden" id="panel-file">
        <div class="form-group">
          <label for="recipeFile">PDF oder Bild hochladen</label>
          <input type="file" id="recipeFile" class="input" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp" />
        </div>
        <button class="btn btn--primary" id="btnImportFile">Datei importieren</button>
      </div>

      <div class="import__panel hidden" id="panel-text">
        <div class="form-group">
          <label for="recipeText">Rezepttext einfügen</label>
          <textarea id="recipeText" class="input input--textarea" rows="10" placeholder="Rezepttext hier einfügen..."></textarea>
        </div>
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

      <!-- Multi-recipe confirmation -->
      <div class="multi-confirm hidden" id="multiConfirm">
        <div class="multi-confirm__header">
          <h2>Mehrere Rezepte erkannt</h2>
          <p class="multi-confirm__desc">In der Quelle wurden mehrere Rezepte gefunden. Bitte prüfe die erkannten Titel und wähle aus, welche importiert werden sollen.</p>
        </div>
        <div class="multi-confirm__list" id="multiList"></div>
        <div class="multi-confirm__actions">
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
        <button class="btn btn--danger" id="btnCancelBatch">Abbrechen</button>
      </div>

      <!-- Batch results -->
      <div class="batch__results hidden" id="batchResults">
        <h2>Import abgeschlossen</h2>
        <div class="batch__summary" id="batchSummary"></div>
        <div class="batch__log" id="batchLog"></div>
        <button class="btn btn--primary" id="btnBatchDone">Zur Übersicht</button>
      </div>
    </div>
  `;

  // Tabs
  const allHideables = ['#importLoading', '#importPreview', '#multiConfirm', '#multiProgress', '#multiResults', '#batchProgress', '#batchResults'];
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
  let currentMultiData = null;  // array of recipe data for multi-confirm

  // --- Single import handlers ---

  $('#btnImportUrl', container).addEventListener('click', async () => {
    const url = $('#recipeUrl', container).value.trim();
    if (!url) { showToast('Bitte URL eingeben.', 'warning'); return; }
    await doImport(() => processURL(url));
  });

  $('#btnImportFile', container).addEventListener('click', async () => {
    const file = $('#recipeFile', container).files[0];
    if (!file) { showToast('Bitte Datei auswählen.', 'warning'); return; }
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    await doImport(() => isPdf ? processPDF(file) : processImage(file));
  });

  $('#btnImportText', container).addEventListener('click', async () => {
    const text = $('#recipeText', container).value.trim();
    if (!text) { showToast('Bitte Text eingeben.', 'warning'); return; }
    await doImport(() => processText(text));
  });

  async function doImport(processFn) {
    const apiKey = await getSetting('apiKey');
    if (!apiKey) {
      showToast('Bitte zuerst den API-Key in den Einstellungen hinterlegen.', 'warning');
      return;
    }

    const loading = $('#importLoading', container);
    allHideables.forEach(sel => $(sel, container).classList.add('hidden'));
    loading.classList.remove('hidden');

    try {
      const results = await processFn(); // always an array now

      if (results.length === 1) {
        // Single recipe → show preview as before
        currentData = results[0];
        showPreview(currentData);
      } else {
        // Multiple recipes → show confirmation screen
        currentMultiData = results;
        showMultiConfirm(results);
      }
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    } finally {
      loading.classList.add('hidden');
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
    const recipe = {
      ...readRecipeForm(form),
      sourceType: currentData.sourceType,
      sourceRef: currentData.sourceRef,
      notes: [],
      cookedDates: [],
      cookedCount: 0
    };

    const pdfData = { ...recipe, recipeText: currentData.recipeText || '' };
    recipe.pdfBlob = generateRecipePDF(pdfData);
    recipe.thumbnailBlob = null;

    try {
      await addRecipe(recipe);
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

  // --- Multi-recipe confirmation ---

  function showMultiConfirm(recipes) {
    const multiEl = $('#multiConfirm', container);
    multiEl.classList.remove('hidden');

    const listEl = $('#multiList', container);
    listEl.innerHTML = recipes.map((r, idx) => `
      <label class="multi-confirm__item">
        <input type="checkbox" checked data-multi-idx="${idx}" />
        <div class="multi-confirm__item-info">
          <strong class="multi-confirm__item-title">${esc(r.title || 'Unbekanntes Rezept')}</strong>
          <span class="multi-confirm__item-meta">
            ${r.category ? `<span class="chip chip--category chip--sm">${esc(r.category)}</span>` : ''}
            ${r.origin ? `<span class="chip chip--origin chip--sm">${esc(r.origin)}</span>` : ''}
            ${r.mainIngredient ? `<span class="chip chip--sm">${esc(r.mainIngredient)}</span>` : ''}
          </span>
          ${r.description ? `<p class="multi-confirm__item-desc">${esc(r.description)}</p>` : ''}
        </div>
      </label>
    `).join('');
  }

  $('#btnMultiCancel', container).addEventListener('click', () => {
    currentMultiData = null;
    $('#multiConfirm', container).classList.add('hidden');
  });

  $('#btnMultiImport', container).addEventListener('click', async () => {
    if (!currentMultiData) return;

    // Collect selected indices
    const checkboxes = container.querySelectorAll('#multiList input[type="checkbox"]');
    const selectedRecipes = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        const idx = parseInt(cb.dataset.multiIdx, 10);
        selectedRecipes.push(currentMultiData[idx]);
      }
    });

    if (selectedRecipes.length === 0) {
      showToast('Bitte mindestens ein Rezept auswählen.', 'warning');
      return;
    }

    // If only one selected, go to single preview for editing
    if (selectedRecipes.length === 1) {
      $('#multiConfirm', container).classList.add('hidden');
      currentData = selectedRecipes[0];
      showPreview(currentData);
      return;
    }

    // Multiple selected → import all with progress
    $('#multiConfirm', container).classList.add('hidden');
    const progressEl = $('#multiProgress', container);
    progressEl.classList.remove('hidden');

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
          servings: r.servings || null,
          difficulty: r.difficulty || '',
          sourceType: r.sourceType || 'text',
          sourceRef: r.sourceRef || '',
          notes: [],
          cookedDates: [],
          cookedCount: 0
        };

        recipe.pdfBlob = generateRecipePDF({ ...recipe, recipeText: r.recipeText || '' });
        recipe.thumbnailBlob = null;

        await addRecipe(recipe);
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
  });

  $('#btnMultiDone', container).addEventListener('click', () => {
    window.location.hash = '#overview';
  });

  // --- Batch import ---

  let batchCancelled = false;

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

    batchCancelled = false;

    $('#panel-batch', container).classList.add('hidden');
    $('#batchProgress', container).classList.remove('hidden');
    $('#batchResults', container).classList.add('hidden');

    const results = { success: [], failed: [], skipped: [] };
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      if (batchCancelled) {
        for (let j = i; j < files.length; j++) {
          results.skipped.push({ file: files[j].webkitRelativePath || files[j].name, reason: 'Abgebrochen' });
        }
        break;
      }

      const file = files[i];
      const filePath = file.webkitRelativePath || file.name;

      const pct = Math.round(((i + 1) / total) * 100);
      $('#batchBar', container).style.width = `${pct}%`;
      $('#batchProgressText', container).textContent = `${i + 1} / ${total}`;
      $('#batchCurrentFile', container).textContent = filePath;

      try {
        let analysisResults; // now always an array

        if (isPdfFile(file)) {
          analysisResults = await processPDF(file);
        } else if (isImageFile(file)) {
          analysisResults = await processImage(file);
        } else if (isTextFile(file)) {
          const text = await file.text();
          if (text.trim().length < 20) {
            results.skipped.push({ file: filePath, reason: 'Zu wenig Text' });
            continue;
          }
          analysisResults = await processText(text);
          for (const r of analysisResults) r.sourceRef = file.name;
        } else {
          results.skipped.push({ file: filePath, reason: 'Nicht unterstütztes Format' });
          continue;
        }

        // Save each recipe from the results
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
            servings: analysisResult.servings || null,
            difficulty: analysisResult.difficulty || '',
            sourceType: analysisResult.sourceType || 'file',
            sourceRef: analysisResult.sourceRef || filePath,
            notes: [],
            cookedDates: [],
            cookedCount: 0
          };

          recipe.pdfBlob = generateRecipePDF({ ...recipe, recipeText: analysisResult.recipeText || '' });
          recipe.thumbnailBlob = null;

          await addRecipe(recipe);
          results.success.push({ file: filePath, title: recipe.title });
        }
      } catch (err) {
        results.failed.push({ file: filePath, reason: err.message });
      }

      if (i < files.length - 1 && !batchCancelled && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    showBatchResults(container, results, total);
  });

  $('#btnCancelBatch', container).addEventListener('click', () => {
    batchCancelled = true;
    $('#btnCancelBatch', container).disabled = true;
    $('#btnCancelBatch', container).textContent = 'Wird abgebrochen...';
  });

  $('#btnBatchDone', container).addEventListener('click', () => {
    window.location.hash = '#overview';
  });
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
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
