import { getSetting } from '../db.js';
import { addRecipe } from '../db.js';
import { processURL, processPDF, processImage, processText } from '../import.js';
import { generateRecipePDF } from '../pdf-generator.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { $, showToast } from '../utils/helpers.js';
import { isAuthenticated, setAuthenticated } from '../utils/auth.js';
import { renderRecipeForm, readRecipeForm } from '../utils/recipe-form.js';

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

      <div class="import__loading hidden" id="importLoading">
        <div class="spinner"></div>
        <p id="loadingText">Rezept wird analysiert...</p>
      </div>

      <div class="import__preview hidden" id="importPreview">
        <h2>Vorschau & Bearbeitung</h2>
        <div class="preview-form" id="previewForm"></div>
        <div class="import__preview-actions">
          <button class="btn btn--primary" id="btnSave">Rezept speichern</button>
          <button class="btn btn--ghost" id="btnCancel">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  // Tabs
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
      container.querySelectorAll('.import__panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('tab--active');
      $(`#panel-${tab.dataset.tab}`, container).classList.remove('hidden');
    });
  });

  let currentData = null;

  // Import handlers
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
    const preview = $('#importPreview', container);
    loading.classList.remove('hidden');
    preview.classList.add('hidden');

    try {
      currentData = await processFn();
      showPreview(currentData);
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
    } finally {
      loading.classList.add('hidden');
    }
  }

  function showPreview(data) {
    const preview = $('#importPreview', container);
    const form = $('#previewForm', container);
    preview.classList.remove('hidden');
    renderRecipeForm(form, data);
  }

  // Save
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

    // Generate PDF
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

  // Cancel
  $('#btnCancel', container).addEventListener('click', () => {
    currentData = null;
    $('#importPreview', container).classList.add('hidden');
  });
}

