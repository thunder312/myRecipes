import { t, getLanguage } from './i18n.js';
import { getAuthToken } from './utils/auth.js';

const CHANGELOG = [
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

  showNewsModal(newFeatures, newRecipes, since);
}

function showNewsModal(features, recipes, since) {
  const existing = document.getElementById('newsModal');
  if (existing) existing.remove();

  const lang = getLanguage();

  const featuresHtml = features.length > 0 ? `
    <div class="news-popup__section">
      <h3 class="news-popup__section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ${t('news.featuresTitle')}
      </h3>
      <ul class="news-popup__list">
        ${features.map(f => `<li>${escapeHtml(lang === 'en' ? f.en : f.de)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const recipesHtml = recipes.length > 0 ? `
    <div class="news-popup__section">
      <h3 class="news-popup__section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2h18v20l-9-5-9 5V2z"/></svg>
        ${t('news.recipesTitle', recipes.length)}
      </h3>
      <ul class="news-popup__list">
        ${recipes.slice(0, 10).map(r => `<li>${escapeHtml(r.title)}</li>`).join('')}
        ${recipes.length > 10 ? `<li class="news-popup__more">… ${t('news.andMore', recipes.length - 10)}</li>` : ''}
      </ul>
    </div>
  ` : '';

  const sinceStr = since.toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const modal = document.createElement('div');
  modal.id = 'newsModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="modal__box news-popup">
      <div class="modal__header">
        <h2>${t('news.title')}</h2>
      </div>
      <div class="modal__body">
        <p class="news-popup__since">${t('news.since', sinceStr)}</p>
        ${featuresHtml}
        ${recipesHtml}
      </div>
      <div class="modal__footer">
        <button class="btn btn--primary" id="btnNewsOk">${t('news.okBtn')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.modal__backdrop').addEventListener('click', close);
  document.getElementById('btnNewsOk').addEventListener('click', close);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
