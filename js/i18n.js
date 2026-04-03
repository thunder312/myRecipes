import { de } from './locales/de.js';
import { en } from './locales/en.js';

const LOCALES = { de, en };
const LANG_KEY = 'myrecipes_lang';

let _lang = localStorage.getItem(LANG_KEY) || 'de';
const _listeners = [];

export function getLanguage() {
  return _lang;
}

export function setLanguage(lang, { save = true, notify = true } = {}) {
  if (!LOCALES[lang]) return;
  _lang = lang;
  if (save) localStorage.setItem(LANG_KEY, lang);
  if (notify) {
    _listeners.forEach(cb => cb(lang));
    window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }
}

export function onLanguageChange(cb) {
  _listeners.push(cb);
}

/**
 * Translate a locale key. Supports:
 *   t('overview.title')             → simple string
 *   t('overview.deleteConfirm', 3)  → locale function called with args
 */
export function t(key, ...args) {
  const locale = LOCALES[_lang] || LOCALES.de;
  const val = key.split('.').reduce((obj, k) => obj?.[k], locale);
  if (val === undefined) return key;
  if (typeof val === 'function') return val(...args);
  return String(val);
}

// --- Category helpers ---

const DE_CATS = de.categories;
const EN_CATS = en.categories;

/**
 * Translate a category value (from DB, could be DE or EN) to the given target language.
 * Falls back to the original value if not found in either list.
 */
export function translateCategory(value, targetLang) {
  if (!value) return value;
  const lang = targetLang || _lang;
  const deIdx = DE_CATS.indexOf(value);
  if (deIdx !== -1) return lang === 'en' ? EN_CATS[deIdx] : DE_CATS[deIdx];
  const enIdx = EN_CATS.indexOf(value);
  if (enIdx !== -1) return lang === 'de' ? DE_CATS[enIdx] : EN_CATS[enIdx];
  return value;
}

/**
 * Returns the category list for the current language.
 */
export function getCategoryList() {
  return (LOCALES[_lang] || LOCALES.de).categories;
}

/**
 * Translate a difficulty value (leicht/mittel/schwer or easy/medium/hard).
 */
export function translateDifficulty(value) {
  if (!value) return value;
  const locale = LOCALES[_lang] || LOCALES.de;
  // value may already be in target lang – check DE keys first
  if (locale.difficulties[value]) return locale.difficulties[value];
  // Try reverse lookup (EN → key)
  const enDiff = en.difficulties;
  const deKey = Object.keys(enDiff).find(k => enDiff[k] === value);
  if (deKey && locale.difficulties[deKey]) return locale.difficulties[deKey];
  return value;
}

/**
 * Returns difficulty options for the current language.
 * Array of { key, label } where key is always the DE canonical key.
 */
export function getDifficultyOptions() {
  const locale = LOCALES[_lang] || LOCALES.de;
  return Object.entries(de.difficulties).map(([key]) => ({
    key,
    label: locale.difficulties[key] || key,
  }));
}
