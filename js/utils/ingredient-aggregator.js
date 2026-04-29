// Best-effort ingredient parser and aggregator for weekly meal plans.
// Groups identical ingredients across recipes and sums quantities where possible.

const KNOWN_UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'L', 'cl', 'dl',
  'EL', 'TL', 'Stk', 'Stück', 'stk', 'Pck', 'Pkt', 'Packung',
  'Dose', 'Dosen', 'Bund', 'Becher', 'Scheibe', 'Scheiben',
  'Zehe', 'Zehen', 'Prise', 'Prisen', 'Msp', 'Msp.',
]);

const FRACTION_VALUES = {
  '½': 0.5, '¼': 0.25, '¾': 0.75,
  '⅓': 1/3, '⅔': 2/3, '⅛': 0.125,
};

function parseQty(s) {
  if (!s) return null;
  s = s.trim();
  for (const [frac, val] of Object.entries(FRACTION_VALUES)) {
    if (s === frac) return val;
    if (s.includes(frac)) {
      const base = parseFloat(s.replace(frac, '').replace(',', '.'));
      return (isNaN(base) ? 0 : base) + val;
    }
  }
  const slashMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) return parseInt(slashMatch[1]) / parseInt(slashMatch[2]);
  const rangeMatch = s.match(/^([\d.,]+)\s*[-–]\s*([\d.,]+)$/);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1].replace(',', '.')) + parseFloat(rangeMatch[2].replace(',', '.'))) / 2;
  }
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseIngredient(str) {
  str = (str || '').trim();
  if (!str) return { qty: null, unit: '', name: str };

  // Match: <qty> <unit?> <name>   e.g. "500 g Mehl", "2 Zwiebeln", "1½ TL Salz"
  const qtyPat = '([\\d.,½¼¾⅓⅔⅛]+(?:\\s*[-–]\\s*[\\d.,]+)?|\\d+\\s*\\/\\s*\\d+)';
  const re = new RegExp(`^${qtyPat}\\s*([a-zA-ZäöüÄÖÜß.]+\\.?)?\\s+(.+)$`, 'u');
  const m = str.match(re);

  if (!m) return { qty: null, unit: '', name: str };

  const qty = parseQty(m[1]);
  const second = (m[2] || '').trim();
  const rest = (m[3] || '').trim();

  if (KNOWN_UNITS.has(second) && rest) {
    return { qty, unit: second, name: rest };
  }
  // second token is part of the name
  return { qty, unit: '', name: (second ? second + ' ' + rest : rest).trim() };
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, '').trim()
    // naive plural removal (handles -en, -n, -e endings)
    .replace(/eln$/, 'el').replace(/nen$/, 'n').replace(/ien$/, 'ie')
    .replace(/en$/, '').replace(/([^e])e$/, '$1').replace(/([a-z])n$/, '$1');
}

function formatQty(qty) {
  if (qty === null || qty === undefined) return '';
  const r = Math.round(qty * 100) / 100;
  if (r % 1 === 0) return String(Math.round(r));
  for (const [frac, val] of Object.entries(FRACTION_VALUES)) {
    if (Math.abs(r - val) < 0.02) return frac;
    if (Math.abs(r - Math.floor(r) - val) < 0.02) return String(Math.floor(r)) + frac;
  }
  return r.toFixed(1).replace('.', ',');
}

export function aggregateIngredients(recipePlans) {
  // recipePlans: [{recipe: {title, ingredients: [string]}}, ...]
  const map = new Map(); // normKey → accumulator

  for (const { recipe } of recipePlans) {
    const title = recipe.title || '';
    for (const raw of (recipe.ingredients || [])) {
      const parsed = parseIngredient(raw);
      const normKey = normalizeName(parsed.name);
      if (!normKey) continue;

      if (map.has(normKey)) {
        const ex = map.get(normKey);
        if (!ex.recipes.includes(title)) ex.recipes.push(title);
        if (parsed.qty !== null && ex.qty !== null && ex.unit === parsed.unit) {
          ex.qty += parsed.qty;
        } else if (parsed.qty !== null) {
          ex.extras.push({ qty: parsed.qty, unit: parsed.unit });
        }
      } else {
        map.set(normKey, {
          name: parsed.name,
          qty: parsed.qty,
          unit: parsed.unit,
          recipes: [title],
          extras: [],
        });
      }
    }
  }

  return [...map.values()].map((item, idx) => {
    const parts = [];
    if (item.qty !== null) parts.push(formatQty(item.qty) + (item.unit ? ' ' + item.unit : ''));
    for (const e of item.extras) {
      const s = formatQty(e.qty) + (e.unit ? ' ' + e.unit : '');
      if (s) parts.push(s);
    }
    return {
      id: idx,
      name: item.name,
      amount: parts.join(' + '),
      recipes: [...new Set(item.recipes)],
      checked: false,
      storeId: null,
    };
  });
}
