// ---------------------------------------------------------------------------
// Ingredient scaling utilities
// ---------------------------------------------------------------------------

// Unicode vulgar fractions → decimal value
const VULGAR = {
  '½': 0.5, '⅓': 1/3, '⅔': 2/3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Decimal → nice display string (prefer vulgar fractions for common values)
const NICE_FRACTIONS = [
  [0.5,  '½'], [1/3, '⅓'],  [2/3, '⅔'],
  [0.25, '¼'], [0.75, '¾'], [0.125, '⅛'],
];

export function formatNumber(n) {
  if (n <= 0) return '0';

  const whole = Math.floor(n);
  const frac  = n - whole;

  if (frac < 0.01) return String(whole);

  // Try to express fractional part as a vulgar fraction
  for (const [val, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - val) < 0.07) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  // Fall back to 1 decimal place, strip trailing zero
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Parse the leading numeric token from an ingredient string.
// Returns { value: Number, end: Number } or null.
// Handles:
//   "200 g …"        → 200
//   "1,5 kg …"       → 1.5
//   "1.5 kg …"       → 1.5
//   "½ TL …"         → 0.5
//   "1½ …"           → 1.5
//   "1/2 …"          → 0.5
//   "2-3 …"          → 2   (lower bound of range; range marker preserved)
//   "ca. 200 g …"    → skip "ca." prefix, then parse
// ---------------------------------------------------------------------------

export function parseLeadingNumber(str) {
  // Optional "ca." / "etwa" / "~" prefix (skip it for scaling but keep in output)
  const prefixMatch = str.match(/^(ca\.|etwa|~)\s*/i);
  const offset = prefixMatch ? prefixMatch[0].length : 0;
  const s = str.slice(offset);

  // Vulgar fraction (possibly preceded by a whole number: "1½")
  const vulgarMatch = s.match(/^(\d*)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/);
  if (vulgarMatch) {
    const whole = vulgarMatch[1] ? parseInt(vulgarMatch[1], 10) : 0;
    const frac  = VULGAR[vulgarMatch[2]];
    return { value: whole + frac, end: offset + vulgarMatch[0].length };
  }

  // ASCII fraction "1/2"
  const asciiMatch = s.match(/^(\d+)\/(\d+)/);
  if (asciiMatch) {
    return {
      value: parseInt(asciiMatch[1], 10) / parseInt(asciiMatch[2], 10),
      end: offset + asciiMatch[0].length,
    };
  }

  // Regular number: integer or decimal (comma or dot), optional range "2-3" or "2–3"
  const numMatch = s.match(/^(\d+(?:[.,]\d+)?)/);
  if (numMatch) {
    const value = parseFloat(numMatch[1].replace(',', '.'));
    let end = offset + numMatch[0].length;
    // If followed by a range dash, record end after the second number
    // so we can keep the range marker intact in the output
    const rangeMatch = s.slice(numMatch[0].length).match(/^(\s*[-–]\s*\d+(?:[.,]\d+)?)/);
    // We scale only the first number; return end just after the first number
    return { value, end };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scale all numeric tokens in an ingredient string by `factor`.
// Only the *first* number is scaled; numbers inside parentheses are also scaled
// (they're usually weight hints like "(ca. 150 g)").
// ---------------------------------------------------------------------------

export function scaleIngredient(str, factor) {
  if (factor === 1) return str;

  let result = '';
  let remaining = str;

  // First pass: scale the leading number
  const first = parseLeadingNumber(remaining);
  if (!first) return str; // no number found → return unchanged

  const scaled = formatNumber(first.value * factor);
  result += scaled;
  remaining = remaining.slice(first.end);

  // Also scale numbers inside parentheses, e.g. "(ca. 150 g)"
  result += remaining.replace(/\(([^)]*)\)/g, (match, inner) => {
    const inner2 = inner.replace(/(ca\.\s*|etwa\s*|~\s*)?([\d½⅓⅔¼¾⅛⅜⅝⅞]+(?:[.,]\d+)?)/g, (m, prefix, numStr) => {
      const parsed = parseLeadingNumber(numStr);
      if (!parsed) return m;
      return (prefix || '') + formatNumber(parsed.value * factor);
    });
    return `(${inner2})`;
  });

  return result;
}
