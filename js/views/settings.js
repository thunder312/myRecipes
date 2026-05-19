import { getSetting, setSetting, exportAll, importAll, getAllUsers, createUser, resetUserPassword, deleteUser, changeUserRole, getAllStores, addStore, deleteStore, getBringConfig, connectBring, getBringLists, saveBringListConfig, disconnectBring, getAllRecipes, uploadRecipeImage, deleteRecipeImage, getAllCookbooks, getCookbookMemberships } from '../db.js';
import { $, showToast, getToastLog, clearToastLog } from '../utils/helpers.js';
import { ensureAuthenticated } from '../utils/auth-ui.js';
import { validateApiKey, BILLING_URL, translateToEn } from '../api.js';
import { getAuthToken, getAuthUser, isAdmin, getShowNewsPopup, setShowNewsPopup } from '../utils/auth.js';
import { t, getLanguage, setLanguage, translateCategory } from '../i18n.js';
import { loadPantryItems, savePantryItems, DEFAULT_PANTRY_DE, DEFAULT_PANTRY_EN } from '../shopping-list.js';

export async function render(container) {
  await ensureAuthenticated(container, () => renderSettings(container));
}

async function renderSettings(container) {
  const user = getAuthUser();
  const admin = isAdmin();
  const apiKey = admin ? (await getSetting('apiKey') || '') : '';
  const pixabayKey = admin ? (await getSetting('pixabayKey') || '') : '';
  const allRecipes = admin ? await getAllRecipes() : [];
  const cookbooks = admin ? await getAllCookbooks() : [];
  const memberships = admin ? await getCookbookMemberships() : [];
  const origins = admin
    ? [...new Set(allRecipes.filter(r => r.origin).map(r => r.origin))].sort()
    : [];

  container.innerHTML = `
    <div class="settings">
      <h1>${t('settings.title')}</h1>
      <p class="settings__hint">${t('settings.loggedInAs', escapeAttr(user.username || ''), user.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleUser'))}</p>

      ${admin ? `
      <section class="settings__section">
        <h2>${t('settings.apiKeySection')}</h2>
        <p class="settings__hint">${t('settings.apiKeyHint')}</p>
        <div class="form-group">
          <label for="apiKeyInput">${t('settings.apiKeyLabel')}</label>
          <input type="password" id="apiKeyInput" class="input" value="${escapeAttr(apiKey)}" placeholder="sk-ant-..." />
          <button class="btn btn--primary" id="btnSaveKey">${t('settings.apiKeySaveBtn')}</button>
        </div>
        <div class="settings__api-status" id="apiStatus"></div>
        <a href="${BILLING_URL}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm">${t('settings.apiKeyBilling')}</a>
      </section>

      <section class="settings__section">
        <h2>${t('settings.pixabaySection')}</h2>
        <p class="settings__hint">${t('settings.pixabayHint')}</p>
        <div class="form-group">
          <label for="pixabayKeyInput">${t('settings.pixabayKeyLabel')}</label>
          <input type="password" id="pixabayKeyInput" class="input" value="${escapeAttr(pixabayKey)}" placeholder="55887044-..." />
          <button class="btn btn--primary" id="btnSavePixabayKey">${t('settings.pixabayKeySaveBtn')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.bulkImageSection')}</h2>
        <p class="settings__hint">${t('settings.bulkImageHint')}</p>
        <div class="bulk-filter-row">
          <div class="form-group">
            <label for="bulkFilterCookbook">${t('settings.bulkFilterCookbook')}</label>
            <select id="bulkFilterCookbook" class="input">
              <option value="">${t('settings.bulkFilterAll')}</option>
              ${cookbooks.map(c => `<option value="${c.id}">${escapeAttr(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="bulkFilterOrigin">${t('settings.bulkFilterOrigin')}</label>
            <select id="bulkFilterOrigin" class="input">
              <option value="">${t('settings.bulkFilterAll')}</option>
              ${origins.map(o => `<option value="${escapeAttr(o)}">${escapeAttr(o)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="bulkFilterKeyword">${t('settings.bulkFilterKeyword')}</label>
            <input type="text" id="bulkFilterKeyword" class="input" placeholder="${t('settings.bulkFilterKeywordPlaceholder')}" />
          </div>
        </div>
        <label class="settings__checkbox-label">
          <input type="checkbox" id="bulkOnlyMissing" checked />
          ${t('settings.bulkImageOnlyMissing')}
        </label>
        <label class="settings__checkbox-label" style="margin-top: var(--space-sm);">
          <input type="checkbox" id="bulkOverwrite" />
          ${t('settings.bulkImageOverwrite')}
        </label>
        <p id="bulkPreviewCount" class="settings__hint bulk-preview-count"></p>
        <div style="margin-top: var(--space-sm);">
          <button class="btn btn--secondary" id="btnBulkImage">${t('settings.bulkImageBtn')}</button>
        </div>
        <div id="bulkImageProgress" class="hidden" style="margin-top: var(--space-md);">
          <div class="batch__progress-bar-wrapper">
            <div class="batch__progress-bar" id="bulkImageBar" style="width:0%"></div>
          </div>
          <p class="batch__progress-text" id="bulkImageText"></p>
          <div class="bulk-image-log" id="bulkImageLog"></div>
        </div>
        <div id="bulkResultSection" class="hidden" style="margin-top: var(--space-lg);">
          <p class="settings__hint"><strong id="bulkResultTitle"></strong></p>
          <div id="bulkResultGrid" class="bulk-result-grid"></div>
        </div>
        <div id="bulkManualSection" class="hidden" style="margin-top: var(--space-lg);">
          <p class="settings__hint"><strong id="bulkManualTitle"></strong></p>
          <p class="settings__hint" id="bulkManualHint"></p>
          <div id="bulkManualList"></div>
        </div>
      </section>
      ` : ''}

      <section class="settings__section">
        <h2>${t('settings.langSection')}</h2>
        <p class="settings__hint">${t('settings.langHint')}</p>
        <div class="lang-toggle" id="langToggle">
          <button class="btn btn--sm ${getLanguage() === 'de' ? 'btn--primary' : 'btn--ghost'}" data-lang="de">${t('settings.langDe')}</button>
          <button class="btn btn--sm ${getLanguage() === 'en' ? 'btn--primary' : 'btn--ghost'}" data-lang="en">${t('settings.langEn')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.themeSection')}</h2>
        <p class="settings__hint">${t('settings.themeHint')}</p>
        <div class="lang-toggle" id="themeToggle">
          <button class="btn btn--sm ${(localStorage.getItem('theme') || 'light') !== 'dark' ? 'btn--primary' : 'btn--ghost'}" data-theme-val="light">${t('nav.themeLight')}</button>
          <button class="btn btn--sm ${(localStorage.getItem('theme') || 'light') === 'dark' ? 'btn--primary' : 'btn--ghost'}" data-theme-val="dark">${t('nav.themeDark')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.passwordSection')}</h2>
        <p class="settings__hint">${t('settings.passwordHint')}</p>
        <div class="form-group">
          <label for="currentPassword">${t('settings.currentPassword')}</label>
          <input type="password" id="currentPassword" class="input" placeholder="${t('settings.currentPassword')}" />
        </div>
        <div class="form-group">
          <label for="newPassword">${t('settings.newPassword')}</label>
          <input type="password" id="newPassword" class="input" placeholder="${t('settings.newPassword')}" />
        </div>
        <div class="form-group">
          <label for="confirmPassword">${t('settings.confirmPassword')}</label>
          <input type="password" id="confirmPassword" class="input" placeholder="${t('settings.confirmPassword')}" />
          <button class="btn btn--primary" id="btnChangePw">${t('settings.changePasswordBtn')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.notificationsSection')}</h2>
        <p class="settings__hint">${t('settings.notificationsHint')}</p>
        <label class="settings__checkbox-label">
          <input type="checkbox" id="newsPopupToggle" ${getShowNewsPopup() ? 'checked' : ''} />
          ${t('settings.newsPopupLabel')}
        </label>
        <button class="btn btn--ghost btn--sm" id="btnShowNewsNow" style="margin-top: var(--space-md);">
          ${t('settings.newsShowNowBtn')}
        </button>
      </section>

      ${admin ? `
      <section class="settings__section">
        <h2>${t('settings.usersSection')}</h2>
        <p class="settings__hint">${t('settings.usersHint')}</p>
        <div class="user-mgmt" id="userList"></div>
        <button class="btn btn--primary" id="btnAddUser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${t('settings.addUserBtn')}
        </button>
        <div class="user-add-form hidden" id="addUserForm">
          <div class="form-group">
            <label for="newUsername">${t('settings.usernamePlaceholder')}</label>
            <input type="text" id="newUsername" class="input" placeholder="${t('settings.usernamePlaceholder')}" />
          </div>
          <div class="form-group">
            <label for="newUserPw">${t('settings.newPassword')}</label>
            <input type="password" id="newUserPw" class="input" placeholder="${t('settings.rolePwPlaceholder')}" />
          </div>
          <div class="form-group">
            <label for="newUserRole">${t('settings.roleLabel')}</label>
            <select id="newUserRole" class="select">
              <option value="user">${t('settings.roleUser')}</option>
              <option value="admin">${t('settings.roleAdmin')}</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--primary" id="btnConfirmAddUser">${t('settings.createUserBtn')}</button>
            <button class="btn btn--ghost" id="btnCancelAddUser">${t('settings.cancelBtn')}</button>
          </div>
        </div>
      </section>
      ` : ''}

      <section class="settings__section" id="storesSection">
        <h2>${t('stores.section')}</h2>
        <p class="settings__hint">${t('stores.hint')}</p>
        <div class="stores-list" id="storesList"></div>
        <div class="store-add-form">
          <input type="color" class="store-add-form__color-input" id="storeColor" value="#3b82f6" title="Farbe wählen" />
          <input type="text" class="input" id="storeName" placeholder="${t('stores.namePlaceholder')}" style="flex:1" />
          <button class="btn btn--secondary" id="btnAddStore">${t('stores.addBtn')}</button>
        </div>
      </section>

      <section class="settings__section" id="pantrySection">
        <h2>${t('settings.pantrySection')}</h2>
        <p class="settings__hint">${t('settings.pantryHint')}</p>
        <div class="pantry-tags" id="pantryTags"></div>
        <div class="form-group pantry-add">
          <input type="text" id="pantryInput" class="input" placeholder="${t('settings.pantryAddPlaceholder')}" />
          <button class="btn btn--secondary" id="btnPantryAdd">${t('settings.pantryAddBtn')}</button>
        </div>
        <button class="btn btn--ghost btn--sm" id="btnPantryReset">${t('settings.pantryResetBtn')}</button>
      </section>

      <section class="settings__section" id="bringSection">
        <h2>${t('settings.bringSection')}</h2>
        <p class="settings__hint">${t('settings.bringHint')}</p>
        <div id="bringConnectForm">
          <div class="form-group">
            <label for="bringEmail">${t('settings.bringEmail')}</label>
            <input type="email" id="bringEmail" class="input" placeholder="name@example.com" />
          </div>
          <div class="form-group">
            <label for="bringPassword">${t('settings.bringPassword')}</label>
            <input type="password" id="bringPassword" class="input" />
          </div>
          <button class="btn btn--bring" id="btnBringConnect">${t('settings.bringConnectBtn')}</button>
        </div>
        <div id="bringConnectedInfo" class="hidden">
          <p class="settings__hint" id="bringConnectedLabel"></p>
          <div class="form-group">
            <label for="bringListSelect">${t('settings.bringListLabel')}</label>
            <select id="bringListSelect" class="select">
              <option value="">${t('settings.bringListPlaceholder')}</option>
            </select>
            <button class="btn btn--primary" id="btnBringListSave">${t('settings.bringListSaveBtn')}</button>
          </div>
          <button class="btn btn--ghost btn--sm" id="btnBringDisconnect">${t('settings.bringDisconnectBtn')}</button>
        </div>
      </section>

      <section class="settings__section">
        <h2>${t('settings.backupSection')}</h2>
        <p class="settings__hint">${t('settings.backupHint')}</p>
        <div class="settings__actions">
          <button class="btn btn--primary" id="btnExport">${t('settings.exportBtn')}</button>
          ${admin ? `<label class="btn btn--secondary">
            ${t('settings.importBtn')}
            <input type="file" id="importFile" accept=".json" class="hidden" />
          </label>` : ''}
        </div>
        <label class="settings__checkbox-label">
          <input type="checkbox" id="exportIncludeImages" />
          ${t('settings.exportIncludeImages')}
        </label>
      </section>

      <section class="settings__section">
        <h2>${t('settings.logSection')}</h2>
        <div class="toast-log" id="toastLog"></div>
        <button class="btn btn--ghost btn--sm" id="btnClearLog">${t('settings.logClearBtn')}</button>
      </section>

      <section class="settings__section">
        <h2>${t('settings.aboutSection')}</h2>
        <p>${t('settings.aboutDesc')}</p>
        <p><small>${t('settings.aboutDb')}</small></p>
      </section>
    </div>
  `;

  initCollapsibleSections(container);

  // --- Language toggle ---
  $('#langToggle', container).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    const lang = btn.dataset.lang;
    setLanguage(lang, { save: true, notify: false });
    // Persist to server
    try {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/auth/language', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ language: lang }),
        });
      }
    } catch { /* ignore */ }
    showToast(t('settings.langSaved'), 'success');
    // Re-render current view (settings) via navigate
    window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  });

  // --- Theme toggle ---
  $('#themeToggle', container)?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-theme-val]');
    if (!btn) return;
    const theme = btn.dataset.themeVal;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    $('#themeToggle', container).querySelectorAll('button').forEach(b => {
      b.className = `btn btn--sm ${b === btn ? 'btn--primary' : 'btn--ghost'}`;
    });
    try {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/auth/theme', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ theme }),
        });
      }
    } catch { /* ignore */ }
    showToast(t('settings.themeSaved'), 'success');
  });

  // --- News popup toggle ---
  $('#newsPopupToggle', container)?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    setShowNewsPopup(enabled);
    try {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/auth/news-popup', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ showNewsPopup: enabled }),
        });
      }
    } catch { /* ignore */ }
    showToast(t('settings.newsPopupSaved'), 'success');
  });

  // --- News jetzt anzeigen ---
  $('#btnShowNewsNow', container)?.addEventListener('click', async () => {
    const { showAllNewsPopup } = await import('../news-popup.js');
    showAllNewsPopup();
  });

  // --- Stores ---
  await initStoresSection(container);

  // --- Pantry items ---
  await initPantrySection(container);

  // --- API Key (admin only) ---
  if (admin) {
    $('#btnSaveKey', container).addEventListener('click', async () => {
      const key = $('#apiKeyInput', container).value.trim();
      if (!key) { showToast(t('settings.apiKeyRequired'), 'warning'); return; }
      const btn = $('#btnSaveKey', container);
      const statusEl = $('#apiStatus', container);
      btn.disabled = true;
      btn.textContent = t('settings.apiKeyChecking');
      statusEl.innerHTML = '';
      try {
        const result = await validateApiKey(key);
        if (!result.valid) {
          statusEl.innerHTML = `<span class="api-status api-status--error">${t('settings.apiKeyStatusInvalid')}</span>`;
          showToast(t('settings.apiKeyInvalid'), 'error');
          return;
        }
        await setSetting('apiKey', key);
        if (result.reason === 'no_credit') {
          statusEl.innerHTML = `<span class="api-status api-status--warning">${t('settings.apiKeyStatusNoCredit', BILLING_URL)}</span>`;
          showToast(t('settings.apiKeySavedNoCredit'), 'warning');
        } else {
          statusEl.innerHTML = `<span class="api-status api-status--ok">${t('settings.apiKeyStatusOk')}</span>`;
          showToast(t('settings.apiKeySavedOk'), 'success');
        }
      } catch (err) {
        await setSetting('apiKey', key);
        showToast(t('settings.apiKeySavedCheckFailed'), 'warning');
      } finally {
        btn.disabled = false;
        btn.textContent = t('settings.apiKeySaveBtn');
      }
    });
  }

  // --- Pixabay API Key (admin only) ---
  if (admin) {
    $('#btnSavePixabayKey', container).addEventListener('click', async () => {
      const key = $('#pixabayKeyInput', container).value.trim().replace(/^["']|["']$/g, '');
      await setSetting('pixabayKey', key);
      showToast(t('settings.pixabayKeySaved'), 'success');
    });

    // --- Bulk Image Search ---
    const buildMembershipSet = (cookbookId) => {
      if (!cookbookId) return null;
      const cbId = parseInt(cookbookId, 10);
      return new Set(memberships.filter(m => m.cookbookId === cbId).map(m => m.recipeId));
    };

    function getBulkFilteredRecipes() {
      const cookbookId = $('#bulkFilterCookbook', container)?.value || '';
      const origin = $('#bulkFilterOrigin', container)?.value || '';
      const keyword = ($('#bulkFilterKeyword', container)?.value || '').trim().toLowerCase();
      const onlyMissing = $('#bulkOnlyMissing', container)?.checked ?? true;
      const overwrite = $('#bulkOverwrite', container)?.checked ?? false;
      const cbSet = buildMembershipSet(cookbookId);
      return allRecipes.filter(r => {
        if (onlyMissing && r.imageMimeType) return false;
        if (!onlyMissing && !overwrite && r.imageMimeType) return false;
        if (cbSet && !cbSet.has(r.id)) return false;
        if (origin && r.origin !== origin) return false;
        if (keyword && !r.title.toLowerCase().includes(keyword)) return false;
        return true;
      });
    }

    function updateBulkCount() {
      const countEl = $('#bulkPreviewCount', container);
      if (!countEl) return;
      const n = getBulkFilteredRecipes().length;
      countEl.textContent = t('settings.bulkPreviewCount', n);
    }

    ['bulkFilterCookbook', 'bulkFilterOrigin', 'bulkOnlyMissing', 'bulkOverwrite'].forEach(id => {
      $('#' + id, container)?.addEventListener('change', updateBulkCount);
    });
    $('#bulkFilterKeyword', container)?.addEventListener('input', updateBulkCount);
    updateBulkCount();

    $('#btnBulkImage', container).addEventListener('click', async () => {
      const pixKey = ($('#pixabayKeyInput', container).value || pixabayKey).trim();
      if (!pixKey) { showToast(t('settings.bulkImageNoKey'), 'warning'); return; }

      const progressEl = $('#bulkImageProgress', container);
      const barEl = $('#bulkImageBar', container);
      const textEl = $('#bulkImageText', container);
      const logEl = $('#bulkImageLog', container);
      const btn = $('#btnBulkImage', container);

      btn.disabled = true;
      progressEl.classList.remove('hidden');
      logEl.innerHTML = '';

      const toProcess = getBulkFilteredRecipes();
      if (toProcess.length === 0) {
        showToast('Keine Rezepte entsprechen den Kriterien.', 'warning');
        btn.disabled = false;
        return;
      }

      let ok = 0, skip = 0, err = 0;
      const total = toProcess.length;
      const noResultRecipes = [];
      const resultPreviews = []; // { id, title, imageBlob }

      function addLog(msg) {
        const line = document.createElement('div');
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      }

      for (let i = 0; i < toProcess.length; i++) {
        const recipe = toProcess[i];
        const pct = Math.round(((i + 1) / total) * 100);
        barEl.style.width = `${pct}%`;
        textEl.textContent = t('settings.bulkImageRunning', i + 1, total);

        try {
          const enTitle = await translateToEn(recipe.title);
          const enCat = recipe.category ? translateCategory(recipe.category, 'en') : '';
          const pixQuery = enCat ? `${enTitle} ${enCat}` : enTitle;
          const searchResp = await fetch(`/api/ai/pixabay?q=${encodeURIComponent(pixQuery)}&lang=en`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
          if (searchResp.status === 429) {
            addLog(`⏳ Rate limit – 10s warten…`);
            await new Promise(r => setTimeout(r, 10000));
            i--; // retry
            continue;
          }
          if (!searchResp.ok) {
            const errBody = await searchResp.json().catch(() => ({}));
            skip++;
            addLog(`⚠ ${recipe.title}: ${errBody.error || `HTTP ${searchResp.status}`}`);
            continue;
          }

          const { hits } = await searchResp.json();
          if (!hits?.length) {
            skip++;
            noResultRecipes.push(recipe);
            addLog(`– ${recipe.title}: Kein Bild gefunden`);
            continue;
          }

          const imgResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(hits[0].webformatURL)}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
          if (!imgResp.ok) { skip++; addLog(`⚠ ${recipe.title}: Bild-Download fehlgeschlagen`); continue; }

          const imgData = await imgResp.json();
          const compressed = await compressBase64(imgData.imageBlob, imgData.imageMimeType);
          await uploadRecipeImage(recipe.id, compressed, 'image/jpeg', 'auto');
          ok++;
          resultPreviews.push({ id: recipe.id, title: recipe.title, imageBlob: compressed });
          addLog(`✓ ${recipe.title} [${pixQuery}]`);
        } catch (e) {
          err++;
          addLog(`✗ ${recipe.title}: ${e.message}`);
        }

        // 1.5s delay between requests
        if (i < toProcess.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      barEl.style.width = '100%';
      textEl.textContent = t('settings.bulkImageDone', ok, skip, err);
      btn.disabled = false;
      showToast(t('settings.bulkImageDone', ok, skip, err), ok > 0 ? 'success' : 'info');

      // Show result preview grid
      const resultSection = $('#bulkResultSection', container);
      const resultGrid = $('#bulkResultGrid', container);
      if (resultPreviews.length > 0 && resultSection && resultGrid) {
        $('#bulkResultTitle', container).textContent = t('settings.bulkResultTitle');
        resultGrid.innerHTML = resultPreviews.map((item) => `
          <div class="bulk-result-item" data-recipe-id="${item.id}">
            <img class="bulk-result-thumb" src="data:image/jpeg;base64,${item.imageBlob}" alt="${escapeAttr(item.title)}" />
            <div class="bulk-result-label">${escapeAttr(item.title)}</div>
            <button class="btn btn--ghost btn--sm bulk-result-remove" data-recipe-id="${item.id}">${t('settings.bulkResultRemove')}</button>
          </div>
        `).join('');
        resultSection.classList.remove('hidden');

        const sectionBody = resultSection.closest('.settings__section-body');
        if (sectionBody) sectionBody.style.maxHeight = sectionBody.scrollHeight + 'px';

        resultGrid.querySelectorAll('.bulk-result-remove').forEach((btn2) => {
          btn2.addEventListener('click', async () => {
            const recipeId = parseInt(btn2.dataset.recipeId, 10);
            btn2.disabled = true;
            btn2.textContent = '…';
            try {
              await deleteRecipeImage(recipeId);
              btn2.closest('.bulk-result-item').remove();
            } catch (e) {
              showToast(e.message, 'error');
              btn2.disabled = false;
              btn2.textContent = t('settings.bulkResultRemove');
            }
          });
        });
      }

      // Show manual URL entry for recipes where Pixabay found nothing
      const manualSection = $('#bulkManualSection', container);
      const manualList = $('#bulkManualList', container);
      if (noResultRecipes.length > 0) {
        $('#bulkManualTitle', container).textContent = t('settings.bulkManualSection');
        $('#bulkManualHint', container).textContent = t('settings.bulkManualHint');
        manualList.innerHTML = noResultRecipes.map((r) => `
          <div class="bulk-manual-row" data-recipe-id="${r.id}">
            <a class="bulk-manual-title" href="https://www.google.com/search?q=${encodeURIComponent(r.title)}&amp;tbm=isch" target="_blank" rel="noopener">${escapeAttr(r.title)}</a>
            <input type="text" class="input bulk-manual-url" placeholder="${t('settings.bulkManualUrlPlaceholder')}" />
            <button class="btn btn--ghost btn--sm bulk-manual-btn">${t('settings.bulkManualApply')}</button>
          </div>
        `).join('');
        manualSection.classList.remove('hidden');

        // Let the section body grow to fit the newly added content
        const sectionBody = manualSection.closest('.settings__section-body');
        if (sectionBody) sectionBody.style.maxHeight = sectionBody.scrollHeight + 'px';

        manualList.querySelectorAll('.bulk-manual-row').forEach((row) => {
          const recipeId = parseInt(row.dataset.recipeId, 10);
          const applyBtn = row.querySelector('.bulk-manual-btn');
          const urlInput = row.querySelector('.bulk-manual-url');
          applyBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (!url) return;
            applyBtn.disabled = true;
            applyBtn.textContent = '…';
            try {
              const imgResp = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`, {
                headers: { Authorization: `Bearer ${getAuthToken()}` },
              });
              if (!imgResp.ok) {
                const errBody = await imgResp.json().catch(() => ({}));
                throw new Error(errBody.error || `HTTP ${imgResp.status}`);
              }
              const imgData = await imgResp.json();
              const compressed = await compressBase64(imgData.imageBlob, imgData.imageMimeType);
              await uploadRecipeImage(recipeId, compressed, 'image/jpeg', 'user');
              applyBtn.textContent = t('settings.bulkManualApplied');
              applyBtn.classList.remove('btn--ghost');
              applyBtn.classList.add('btn--success');
              urlInput.disabled = true;
            } catch (e) {
              showToast(e.message, 'error');
              applyBtn.disabled = false;
              applyBtn.textContent = t('settings.bulkManualApply');
            }
          });
        });
      } else {
        manualSection.classList.add('hidden');
      }
    });
  }

  // --- Change own password ---
  $('#btnChangePw', container).addEventListener('click', async () => {
    const currentPw = $('#currentPassword', container).value;
    const newPw = $('#newPassword', container).value;
    const confirmPw = $('#confirmPassword', container).value;
    if (!newPw || newPw.length < 4) { showToast(t('settings.passwordTooShort'), 'warning'); return; }
    if (newPw !== confirmPw) { showToast(t('settings.passwordMismatch'), 'warning'); return; }
    try {
      const token = getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || t('settings.passwordFailed'), 'error');
        return;
      }
      showToast(t('settings.passwordChanged'), 'success');
      $('#currentPassword', container).value = '';
      $('#newPassword', container).value = '';
      $('#confirmPassword', container).value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // --- User management (admin only) ---
  if (admin) {
    await loadUserList(container);

    $('#btnAddUser', container).addEventListener('click', () => {
      $('#addUserForm', container).classList.remove('hidden');
      $('#btnAddUser', container).classList.add('hidden');
      $('#newUsername', container).focus();
    });

    $('#btnCancelAddUser', container).addEventListener('click', () => {
      $('#addUserForm', container).classList.add('hidden');
      $('#btnAddUser', container).classList.remove('hidden');
    });

    $('#btnConfirmAddUser', container).addEventListener('click', async () => {
      const username = $('#newUsername', container).value.trim();
      const password = $('#newUserPw', container).value;
      const role = $('#newUserRole', container).value;
      if (!username) { showToast(t('settings.usernameRequired'), 'warning'); return; }
      if (!password || password.length < 4) { showToast(t('settings.pwMinLength'), 'warning'); return; }
      try {
        await createUser(username, password, role);
        showToast(t('settings.userCreated', username), 'success');
        $('#newUsername', container).value = '';
        $('#newUserPw', container).value = '';
        $('#addUserForm', container).classList.add('hidden');
        $('#btnAddUser', container).classList.remove('hidden');
        await loadUserList(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // --- Bring! integration ---
  await initBringSection(container);

  // --- Export ---
  $('#btnExport', container).addEventListener('click', async () => {
    try {
      const includeImages = $('#exportIncludeImages', container)?.checked || false;
      const data = await exportAll(includeImages);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myrecipes-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('settings.backupDownloaded'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // --- Import (admin only) ---
  if (admin) {
    $('#importFile', container).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm(t('settings.importConfirm'))) { e.target.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.recipes || !data.settings) throw new Error('Invalid backup format.');
        await importAll(data);
        showToast(t('settings.backupImportedCount', data.recipes.length), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // --- Toast Log ---
  renderToastLog(container);
  $('#btnClearLog', container).addEventListener('click', () => {
    clearToastLog();
    renderToastLog(container);
    showToast(t('settings.logCleared'), 'success');
  });
}

async function initBringSection(container) {
  async function showConnectedState(email, listUuid) {
    $('#bringConnectForm', container)?.classList.add('hidden');
    const info = $('#bringConnectedInfo', container);
    info?.classList.remove('hidden');
    const label = $('#bringConnectedLabel', container);
    if (label) label.textContent = t('settings.bringConnected', email);
    // Load lists
    try {
      const lists = await getBringLists();
      const sel = $('#bringListSelect', container);
      if (sel) {
        sel.innerHTML = lists.map(l =>
          `<option value="${escapeAttr(l.listUuid)}" ${l.listUuid === listUuid ? 'selected' : ''}>${escapeAttr(l.name)}</option>`
        ).join('');
      }
    } catch (err) {
      showToast(err.message || t('settings.bringPushFailed'), 'error');
    }
  }

  try {
    const config = await getBringConfig();
    if (config.connected) {
      await showConnectedState(config.email, config.listUuid);
    }
  } catch { /* not connected */ }

  $('#btnBringConnect', container)?.addEventListener('click', async () => {
    const email = $('#bringEmail', container).value.trim();
    const password = $('#bringPassword', container).value;
    if (!email || !password) { showToast(t('settings.bringEmail') + ' / ' + t('settings.bringPassword'), 'warning'); return; }
    const btn = $('#btnBringConnect', container);
    btn.disabled = true;
    btn.textContent = t('settings.bringConnecting');
    try {
      await connectBring(email, password);
      showToast(t('settings.bringConnectionOk'), 'success');
      await showConnectedState(email, null);
    } catch {
      showToast(t('settings.bringConnectFailed'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('settings.bringConnectBtn');
    }
  });

  $('#btnBringListSave', container)?.addEventListener('click', async () => {
    const listUuid = $('#bringListSelect', container)?.value;
    if (!listUuid) return;
    try {
      await saveBringListConfig(listUuid);
      showToast(t('settings.bringListSaved'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#btnBringDisconnect', container)?.addEventListener('click', async () => {
    try {
      await disconnectBring();
      $('#bringConnectedInfo', container)?.classList.add('hidden');
      $('#bringConnectForm', container)?.classList.remove('hidden');
      $('#bringEmail', container).value = '';
      $('#bringPassword', container).value = '';
      showToast(t('settings.bringDisconnected'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadUserList(container) {
  const currentUser = getAuthUser();
  try {
    const users = await getAllUsers();
    const list = $('#userList', container);
    if (!list) return;

    list.innerHTML = users.map(u => `
      <div class="user-row" data-user-id="${u.id}">
        <div class="user-row__info">
          <span class="user-row__name">${escapeAttr(u.username)}</span>
          <span class="user-row__role ${u.role === 'admin' ? 'user-row__role--admin' : ''}">${u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleUser')}</span>
          ${u.username === currentUser.username ? `<span class="user-row__you">${t('settings.youLabel')}</span>` : ''}
        </div>
        <div class="user-row__actions">
          <button class="btn btn--ghost btn--sm" data-action="reset-pw" data-id="${u.id}" title="${t('settings.resetPasswordBtn')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          ${u.username !== currentUser.username ? `<button class="btn btn--ghost btn--sm btn--danger-text" data-action="delete" data-id="${u.id}" title="${t('settings.deleteUserBtn')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>` : ''}
        </div>
        <div class="user-row__reset hidden" id="resetForm-${u.id}">
          <input type="password" class="input" placeholder="${t('settings.newPassword')}" id="resetPwInput-${u.id}" />
          <button class="btn btn--sm btn--primary" data-action="confirm-reset" data-id="${u.id}">${t('settings.setPwBtn')}</button>
          <button class="btn btn--sm btn--ghost" data-action="cancel-reset" data-id="${u.id}">${t('settings.cancelBtn')}</button>
        </div>
      </div>
    `).join('');

    // Delegate events
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      const action = btn.dataset.action;

      if (action === 'reset-pw') {
        list.querySelector(`#resetForm-${id}`)?.classList.remove('hidden');
        list.querySelector(`#resetPwInput-${id}`)?.focus();
      } else if (action === 'cancel-reset') {
        list.querySelector(`#resetForm-${id}`)?.classList.add('hidden');
      } else if (action === 'confirm-reset') {
        const pw = list.querySelector(`#resetPwInput-${id}`)?.value;
        if (!pw || pw.length < 4) { showToast(t('settings.pwMinLength'), 'warning'); return; }
        try {
          await resetUserPassword(id, pw);
          showToast(t('settings.passwordReset'), 'success');
          list.querySelector(`#resetForm-${id}`)?.classList.add('hidden');
        } catch (err) { showToast(err.message, 'error'); }
      } else if (action === 'delete') {
        const row = list.querySelector(`[data-user-id="${id}"]`);
        const name = row?.querySelector('.user-row__name')?.textContent || '';
        if (!confirm(t('settings.userDeleteConfirm', name))) return;
        try {
          await deleteUser(id);
          showToast(t('settings.userDeleted', name), 'success');
          await loadUserList(container);
        } catch (err) { showToast(err.message, 'error'); }
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderToastLog(container) {
  const logEl = $('#toastLog', container);
  const entries = getToastLog();
  if (entries.length === 0) {
    logEl.innerHTML = `<p class="toast-log__empty">${t('settings.logEmpty')}</p>`;
    return;
  }
  logEl.innerHTML = entries.slice().reverse().map(e => {
    const d = new Date(e.time);
    const time = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="toast-log__entry toast-log__entry--${escapeAttr(e.type)}">
      <span class="toast-log__time">${time}</span>
      <span class="toast-log__msg">${escapeAttr(e.message)}</span>
    </div>`;
  }).join('');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initCollapsibleSections(container) {
  container.querySelectorAll('.settings__section').forEach((section) => {
    const h2 = section.querySelector(':scope > h2');
    if (!h2) return;

    const key = 'settings_sec_' + h2.textContent.trim().slice(0, 40);
    const stored = localStorage.getItem(key);
    const collapsed = stored === null ? true : stored === '1';

    // Wrap all non-h2 children in a collapsible body div
    const body = document.createElement('div');
    body.className = 'settings__section-body';
    [...section.children].filter(el => el !== h2).forEach(el => body.appendChild(el));
    section.appendChild(body);

    // Add chevron icon to h2
    h2.classList.add('settings__section-header');
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'settings__chevron');
    chevron.setAttribute('width', '18');
    chevron.setAttribute('height', '18');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    chevron.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
    h2.appendChild(chevron);

    if (collapsed) section.classList.add('settings__section--collapsed');

    h2.addEventListener('click', () => {
      const now = section.classList.toggle('settings__section--collapsed');
      localStorage.setItem(key, now ? '1' : '0');
    });
  });
}

function compressBase64(base64, mimeType, maxPx = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// ---------------------------------------------------------------------------
// Stores section
// ---------------------------------------------------------------------------

async function initStoresSection(container) {
  let stores = [];
  try { stores = await getAllStores(); } catch { /* ignore */ }

  function renderStores() {
    const list = $('#storesList', container);
    if (!list) return;
    if (stores.length === 0) {
      list.innerHTML = `<p class="pantry-tags__empty">${t('stores.empty')}</p>`;
      return;
    }
    list.innerHTML = stores.map(s => `
      <div class="store-row" data-store-id="${s.id}">
        <div class="store-row__color" style="background:${escapeAttr(s.color)}"></div>
        <span class="store-row__name">${escapeAttr(s.name)}</span>
        <button class="btn btn--ghost btn--sm btn--danger-text" data-action="delete-store" data-id="${s.id}" data-name="${escapeAttr(s.name)}" title="${t('settings.deleteUserBtn')}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    `).join('');
  }

  renderStores();

  // Delete store
  $('#storesList', container)?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-store"]');
    if (!btn) return;
    const name = btn.dataset.name;
    if (!confirm(t('stores.deleteConfirm', name))) return;
    try {
      await deleteStore(parseInt(btn.dataset.id, 10));
      stores = stores.filter(s => s.id !== parseInt(btn.dataset.id, 10));
      renderStores();
      showToast(t('stores.deleted', name), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Add store
  $('#btnAddStore', container)?.addEventListener('click', async () => {
    const nameInput = $('#storeName', container);
    const colorInput = $('#storeColor', container);
    const name = nameInput?.value.trim();
    if (!name) { showToast(t('stores.nameRequired'), 'warning'); return; }
    try {
      const result = await addStore(name, colorInput?.value || '#6b7280');
      stores.push({ id: result.id, name, color: colorInput?.value || '#6b7280' });
      renderStores();
      if (nameInput) nameInput.value = '';
      showToast(t('stores.created', name), 'success');
    } catch (err) {
      if (err.message && err.message.includes('existiert bereits')) {
        showToast(t('stores.alreadyExists'), 'warning');
      } else {
        showToast(err.message, 'error');
      }
    }
  });

  $('#storeName', container)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btnAddStore', container)?.click(); }
  });
}

// ---------------------------------------------------------------------------
// Pantry items section
// ---------------------------------------------------------------------------

async function initPantrySection(container) {
  let items = await loadPantryItems();

  function renderTags() {
    items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const tagsEl = $('#pantryTags', container);
    if (!tagsEl) return;
    if (items.length === 0) {
      tagsEl.innerHTML = `<p class="pantry-tags__empty">${t('settings.pantryEmpty')}</p>`;
      return;
    }
    tagsEl.innerHTML = items.map((item, idx) =>
      `<span class="pantry-tag">
        ${escapeAttr(item)}
        <button class="pantry-tag__remove" data-idx="${idx}" aria-label="Entfernen">&times;</button>
      </span>`
    ).join('');
  }

  renderTags();

  // Remove tag
  $('#pantryTags', container).addEventListener('click', async (e) => {
    const btn = e.target.closest('.pantry-tag__remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    items.splice(idx, 1);
    renderTags();
    await savePantryItems(items);
    showToast(t('settings.pantrySaved'), 'success');
  });

  // Add tag
  const addBtn = $('#btnPantryAdd', container);
  const input = $('#pantryInput', container);

  async function addItem() {
    const val = input.value.trim();
    if (!val) return;
    if (!items.map(i => i.toLowerCase()).includes(val.toLowerCase())) {
      items.push(val);
      renderTags();
      await savePantryItems(items);
      showToast(t('settings.pantrySaved'), 'success');
    }
    input.value = '';
    input.focus();
  }

  addBtn.addEventListener('click', addItem);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

  // Reset to defaults
  $('#btnPantryReset', container).addEventListener('click', async () => {
    const lang = document.documentElement.lang || 'de';
    items = lang === 'en' ? [...DEFAULT_PANTRY_EN] : [...DEFAULT_PANTRY_DE];
    renderTags();
    await savePantryItems(items);
    showToast(t('settings.pantryReset'), 'success');
  });
}
