export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

export function formatDate(isoString) {
  if (!isoString) return '–';
  const d = new Date(isoString);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function showToast(message, type = 'info') {
  const toast = createElement('div', { className: `toast toast--${type}`, textContent: message });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const CATEGORY_CLASS_MAP = {
  'Vorspeise': 'chip--cat-vorspeise',
  'Hauptspeise': 'chip--cat-hauptspeise',
  'Nachspeise': 'chip--cat-nachspeise',
  'Fingerfood': 'chip--cat-fingerfood',
  'Suppe': 'chip--cat-suppe',
  'Salat': 'chip--cat-salat',
  'Beilage': 'chip--cat-beilage',
  'Getränk': 'chip--cat-getraenk',
  'Snack': 'chip--cat-snack',
  'Brot/Gebäck': 'chip--cat-brot',
  'Gewürzmischungen': 'chip--cat-gewuerz',
  'Kuchen': 'chip--cat-kuchen',
  'Soße': 'chip--cat-sosse',
  'Sauerkonserven': 'chip--cat-sauerkonserven',
  'Wurstrezept': 'chip--cat-wurst',
};

export function categoryChipClass(category) {
  return CATEGORY_CLASS_MAP[category] || 'chip--category';
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
