import { t, getLanguage } from './i18n.js';
import { getAuthToken } from './utils/auth.js';

const CHANGELOG = [
  {
    date: '2026-05-23',
    highlight: true,
    de: 'Neue Bildsuche via Chefkoch.de: Im KI-Ergänzungs-Dialog und beim Import kann jetzt ein passendes Bild von Chefkoch gesucht und direkt übernommen werden. Admins können die Suche auch als Massen-Import für alle Rezepte nutzen.',
    en: 'New image search via Chefkoch.de: In the AI enhancement dialog and during import, you can now search for a matching photo on Chefkoch and apply it directly. Admins can also run this as a bulk import for all recipes.',
  },
  {
    date: '2026-05-23',
    de: 'Pixabay-Bildersuche entfernt – die Ergebnisse waren zu ungenau. Alle automatisch zugewiesenen Bilder wurden bereinigt.',
    en: 'Pixabay image search removed – results were too inaccurate. All automatically assigned images have been cleaned up.',
  },
  {
    date: '2026-05-19',
    highlight: true,
    de: 'Eure Rezepte werden jetzt täglich automatisch gesichert – falls einmal etwas schiefläuft, können die Daten wiederhergestellt werden.',
    en: 'Your recipes are now automatically backed up every day – if something ever goes wrong, your data can be restored.',
  },
  {
    date: '2026-05-19',
    de: 'Neuigkeiten-Pop-Up: Jetzt nach Datum blättern – mit Vor/Zurück-Navigation durch alle Release-Tage.',
    en: 'News pop-up: Browse release notes by date – navigate forward and back through all release days.',
  },
  {
    date: '2026-05-16',
    de: 'Massenbildersuche: Nach dem Durchlauf erscheint eine Bildvorschau aller zugewiesenen Fotos – mit Entfernen-Button falls ein Bild nicht passt.',
    en: 'Bulk image search: After the run, a photo preview of all assigned images appears – with a remove button in case a photo doesn\'t fit.',
  },
  {
    date: '2026-05-16',
    de: 'Automatisch zugewiesene Bilder (Pixabay-Bulk oder KI-Ergänzung) zeigen jetzt einen Badge „Automatisch gesucht" am Bild – als Hinweis, dass das Foto kein echtes Foto des Gerichts ist.',
    en: 'Automatically assigned photos (Pixabay bulk search or AI enhancement) now show an "Auto-searched" badge on the image – as a reminder that the photo may not show the actual dish.',
  },
  {
    date: '2026-05-16',
    de: 'Rezept-Detailseite: Bild jetzt als Vorschau – per Klick in voller Auflösung. PDF-Block einklappbar. Portionen-Scaler direkt neben dem Einkaufszettel. Koch-Statistik kompakter.',
    en: 'Recipe detail page: Image shown as thumbnail – click to view full resolution. PDF block now collapsible. Serving scaler right next to the shopping list. Cook stats more compact.',
  },
  {
    date: '2026-05-16',
    de: 'Mobil: Navigationsleiste springt beim Scrollen nicht mehr.',
    en: 'Mobile: Navigation bar no longer jumps when scrolling.',
  },
  {
    date: '2026-05-16',
    de: 'Massenbildersuche (Admin): Bilder für mehrere Rezepte auf einmal suchen – mit Filter nach Kochbuch, Herkunft und Stichwort sowie Vorschau der Trefferanzahl. Nur für Admins, um die Pixabay-API nicht zu überlasten.',
    en: 'Bulk image search (admin): Find photos for multiple recipes at once – filter by cookbook, origin and keyword with a live preview count. Admin-only to avoid overloading the Pixabay API.',
  },
  {
    date: '2026-05-16',
    de: 'KI-Ergänzung: Beilagen, Tags und Beschreibung per KI vorschlagen lassen – inkl. Bildsuche via Pixabay.',
    en: 'AI Enhancement: Get AI suggestions for sides, tags and description – with optional Pixabay image search.',
  },
  {
    date: '2026-05-16',
    de: 'Beim Import kann jetzt optional ein passendes Bild aus Pixabay gesucht und direkt hinzugefügt werden.',
    en: 'During import, you can now search Pixabay for a matching photo and add it directly.',
  },
  {
    date: '2026-05-16',
    de: 'Neue Kategorien: Frühstück, Dip und Süßkonserven.',
    en: 'New categories: Breakfast, Dip and Sweet Preserves.',
  },
  {
    date: '2026-05-16',
    de: 'Koch-Modus-Button jetzt direkt oben neben der Bewertung.',
    en: 'Cook mode button now at the top next to the rating.',
  },
  {
    date: '2026-05-16',
    de: '"Von wem/Woher" wird jetzt in der Rezept-Detailansicht angezeigt.',
    en: '"Source" field is now shown in the recipe detail view.',
  },
  {
    date: '2026-05-16',
    de: 'Freitextsuche findet jetzt auch Rezepte über das Feld „Von wem/Woher".',
    en: 'Free text search now also finds recipes by their source field.',
  },
  {
    date: '2026-05-16',
    de: 'Neuigkeiten-Pop-Up: Sieh nach dem Login, was neu dazugekommen ist.',
    en: 'News pop-up: See what\'s new since your last login.',
  },
  {
    date: '2026-05-10',
    de: 'Bring! Integration: Einkaufsliste direkt in die Bring!-App pushen.',
    en: 'Bring! integration: Push your shopping list directly to the Bring! app.',
  },
  {
    date: '2026-05-10',
    de: 'Notizen-Chat, PDF-Optionen und Einkaufs-Sicht-Button.',
    en: 'Notes chat, PDF options and shopping view button.',
  },
  {
    date: '2026-05-10',
    de: 'Supermarkt-Zuordnungen sind jetzt pro Benutzer gespeichert.',
    en: 'Supermarket assignments are now saved per user.',
  },
  {
    date: '2026-05-07',
    de: 'Wochenplan: Alle Tage auf einmal mit KI befüllen.',
    en: 'Week plan: Fill all days at once with AI.',
  },
  {
    date: '2026-05-02',
    de: 'Rezeptbilder per URL laden und Auto-Bild beim Import.',
    en: 'Load recipe images by URL and auto-image on import.',
  },
  {
    date: '2026-05-02',
    de: 'Kochmodus für Handys verbessert (Querformat, zuverlässige Navigation).',
    en: 'Cooking mode improved for mobile (landscape mode, reliable navigation).',
  },
  {
    date: '2026-04-29',
    de: 'Supermarkt-Modus für den Wochen-Einkaufszettel.',
    en: 'Supermarket mode for the weekly shopping list.',
  },
  {
    date: '2026-04-29',
    de: 'Einstellungen (Supermärkte, Vorratskammer) für alle Benutzer.',
    en: 'Settings (supermarkets, pantry) available for all users.',
  },
];

export async function showAllNewsPopup() {
  const oldestEntry = CHANGELOG[CHANGELOG.length - 1].date;
  let recipes = [];
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/auth/news?since=${encodeURIComponent(oldestEntry + 'T00:00:00.000Z')}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      recipes = data.recipes || [];
    }
  } catch { /* ignore */ }
  showNewsModal(CHANGELOG, recipes, new Date());
}

export async function maybeShowNewsPopup(lastLoginAt) {
  if (!lastLoginAt) return;

  const since = new Date(lastLoginAt);
  const newFeatures = CHANGELOG.filter(entry => new Date(entry.date) > since);

  let newRecipes = [];
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/auth/news?since=${encodeURIComponent(lastLoginAt)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      newRecipes = data.recipes || [];
    }
  } catch { /* ignore network errors */ }

  if (newFeatures.length === 0 && newRecipes.length === 0) return;

  showNewsModal(CHANGELOG, newRecipes, since);
}

function showNewsModal(allFeatures, recipes, since) {
  const existing = document.getElementById('newsModal');
  if (existing) existing.remove();

  const lang = getLanguage();

  // Build per-day map: { features: [], recipes: [] }
  const dateMap = {};
  const ensure = (d) => { if (!dateMap[d]) dateMap[d] = { features: [], recipes: [] }; };

  for (const entry of allFeatures) {
    ensure(entry.date);
    dateMap[entry.date].features.push(entry);
  }
  for (const recipe of recipes) {
    const date = recipe.createdAt ? recipe.createdAt.substring(0, 10) : null;
    if (!date) continue;
    ensure(date);
    dateMap[date].recipes.push(recipe);
  }

  const days = Object.keys(dateMap).sort((a, b) => new Date(b) - new Date(a));
  const total = days.length;

  const firstNewIdx = days.findIndex(d => new Date(d) > since);
  let currentIndex = firstNewIdx !== -1 ? firstNewIdx : 0;

  const formatDate = (dateStr) => new Date(dateStr + 'T12:00:00').toLocaleDateString(
    lang === 'en' ? 'en-GB' : 'de-DE',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  const navHtml = total > 1 ? `
    <div class="news-popup__nav">
      <button class="news-popup__nav-btn" id="btnNewsPrev">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="news-popup__nav-center">
        <span class="news-popup__nav-date" id="newsNavDate"></span>
        <span class="news-popup__new-badge" id="newsNewBadge">${t('news.newBadge')}</span>
      </div>
      <button class="news-popup__nav-btn" id="btnNewsNext">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  ` : '';

  const modal = document.createElement('div');
  modal.id = 'newsModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box news-popup">
      <div class="modal__header news-popup__header">
        <h2>${t('news.title')}</h2>
        ${navHtml}
      </div>
      <div class="modal__body">
        <div class="news-popup__section" id="newsContent"></div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--primary" id="btnNewsOk">${t('news.okBtn')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function renderDayContent(index) {
    const { features, recipes: dayRecipes } = dateMap[days[index]];
    const highlighted = features.filter(f => f.highlight);
    const normal = features.filter(f => !f.highlight);

    const highlightHtml = highlighted.map(f => `
      <div class="news-popup__highlight">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>${escapeHtml(lang === 'en' ? f.en : f.de)}</span>
      </div>
    `).join('');

    const normalHtml = normal.length > 0 ? `
      <ul class="news-popup__list">
        ${normal.map(f => `<li>${escapeHtml(lang === 'en' ? f.en : f.de)}</li>`).join('')}
      </ul>
    ` : '';

    const recipesHtml = dayRecipes.length > 0 ? `
      <div class="news-popup__section">
        <h3 class="news-popup__section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2h18v20l-9-5-9 5V2z"/></svg>
          ${t('news.recipesTitle', dayRecipes.length)}
        </h3>
        <ul class="news-popup__list">
          ${dayRecipes.slice(0, 10).map(r => `<li>${escapeHtml(r.title)}</li>`).join('')}
          ${dayRecipes.length > 10 ? `<li class="news-popup__more">… ${t('news.andMore', dayRecipes.length - 10)}</li>` : ''}
        </ul>
      </div>
    ` : '';

    return highlightHtml + normalHtml + recipesHtml;
  }

  function updatePage(index) {
    currentIndex = index;
    document.getElementById('newsContent').innerHTML = renderDayContent(index);

    if (total > 1) {
      document.getElementById('newsNavDate').textContent = formatDate(days[index]);

      const badge = document.getElementById('newsNewBadge');
      badge.style.display = new Date(days[index]) > since ? '' : 'none';

      document.getElementById('btnNewsPrev').disabled = index >= total - 1;
      document.getElementById('btnNewsNext').disabled = index <= 0;
    }
  }

  updatePage(currentIndex);

  if (total > 1) {
    document.getElementById('btnNewsPrev').addEventListener('click', () => {
      if (currentIndex < total - 1) updatePage(currentIndex + 1);
    });
    document.getElementById('btnNewsNext').addEventListener('click', () => {
      if (currentIndex > 0) updatePage(currentIndex - 1);
    });
  }

  const close = () => modal.remove();
  modal.querySelector('.modal__backdrop').addEventListener('click', close);
  document.getElementById('btnNewsOk').addEventListener('click', close);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
