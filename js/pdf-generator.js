import { jsPDF } from 'jspdf';

function splitIntoSteps(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = text.split(/;\s+|\.\s+(?=[A-ZÜÄÖ])/);
  const result = parts.map(s => s.trim()).filter(Boolean);
  return result.length > 1 ? result : lines;
}

// Canonical display order for categories
const CATEGORY_ORDER = [
  'Vorspeise', 'Suppe', 'Salat', 'Hauptspeise', 'Beilage',
  'Fingerfood', 'Snack', 'Nachspeise', 'Kuchen', 'Brot/Gebäck',
  'Soße', 'Getränk', 'Gewürzmischungen', 'Sauerkonserven', 'Wurstrezept',
];

function groupByCategory(recipes) {
  const map = new Map();
  for (const r of recipes) {
    const cat = r.category || 'Sonstiges';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(r);
  }
  const sorted = new Map();
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) sorted.set(cat, map.get(cat));
  }
  for (const [cat, rs] of map) {
    if (!sorted.has(cat)) sorted.set(cat, rs);
  }
  return sorted;
}

// Estimate how many pages the TOC will need
function estimateTocPages(groups, pageHeight, margin) {
  const headerH = 22; // "Inhaltsverzeichnis" heading block
  const catH = 11;    // per category row
  const recH = 7;     // per recipe row
  const gapH = 4;     // gap after each category block
  const avail = pageHeight - 2 * margin;
  let used = headerH;
  let pages = 1;
  for (const [, rs] of groups) {
    const block = catH + rs.length * recH + gapH;
    if (used + block > avail) { pages++; used = block; }
    else used += block;
  }
  return pages;
}

function addCookbookCover(doc, cookbook, recipeCount, pageWidth, pageHeight, margin) {
  const contentWidth = pageWidth - 2 * margin;

  // Title
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  const title = cookbook.coverTitle || cookbook.name || 'Kochbuch';
  const titleLines = doc.splitTextToSize(title, contentWidth);
  const titleY = pageHeight * 0.40;
  doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

  let y = titleY + titleLines.length * 13;

  // Thin decorative line
  doc.setDrawColor(180);
  doc.setLineWidth(0.6);
  doc.line(margin + 20, y + 5, pageWidth - margin - 20, y + 5);
  y += 14;

  // Subtitle
  if (cookbook.coverSubtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(70);
    doc.text(cookbook.coverSubtitle, pageWidth / 2, y, { align: 'center' });
    y += 12;
  }

  // Description
  if (cookbook.description) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(100);
    const descLines = doc.splitTextToSize(cookbook.description, contentWidth - 20);
    doc.text(descLines, pageWidth / 2, y + 4, { align: 'center' });
  }

  // Recipe count
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(130);
  doc.text(
    `${recipeCount} Rezept${recipeCount !== 1 ? 'e' : ''}`,
    pageWidth / 2,
    pageHeight - 22,
    { align: 'center' }
  );

  // Light bottom bar
  doc.setFillColor(238, 238, 238);
  doc.rect(0, pageHeight - 13, pageWidth, 13, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('erstellt mit myRecipes  \u2022  KI-Unterst\u00fctzung durch Claude (Anthropic)', pageWidth / 2, pageHeight - 4.5, { align: 'center' });
}

function addChapterPage(doc, category, pageWidth, pageHeight, margin) {
  // Light band in the middle third of the page
  doc.setFillColor(245, 245, 245);
  doc.rect(0, pageHeight * 0.37, pageWidth, pageHeight * 0.26, 'F');
  doc.setDrawColor(180);
  doc.setLineWidth(0.7);
  doc.line(margin, pageHeight * 0.37, pageWidth - margin, pageHeight * 0.37);
  doc.line(margin, pageHeight * 0.63, pageWidth - margin, pageHeight * 0.63);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(25);
  doc.text(category, pageWidth / 2, pageHeight * 0.50 + 6, { align: 'center' });
}

function renderToc(doc, tocData, startPage, tocPageCount, pageWidth, pageHeight, margin, contentWidth) {
  let curPage = startPage;
  const lastPage = startPage + tocPageCount - 1;

  doc.setPage(curPage);

  // Heading
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Inhaltsverzeichnis', margin, margin + 8);
  doc.setDrawColor(190);
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 12, pageWidth - margin, margin + 12);

  let y = margin + 22;

  function advance(needed) {
    if (y + needed > pageHeight - margin) {
      if (curPage >= lastPage) return false;
      curPage++;
      doc.setPage(curPage);
      y = margin + 8;
    }
    return true;
  }

  for (const { category, page, recipes } of tocData) {
    if (!advance(11)) break;

    // Category header row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(category, margin, y);
    doc.setTextColor(100);
    doc.text(String(page), pageWidth - margin, y, { align: 'right' });
    y += 7;

    // Recipe rows (indented)
    for (const { title, page: rp } of recipes) {
      if (!advance(7)) break;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const pageStr = String(rp);
      const pageStrW = doc.getTextWidth(pageStr);
      const maxW = contentWidth - pageStrW - 8;
      let t = '  ' + (title || '');
      if (doc.getTextWidth(t) > maxW) {
        while (t.length > 4 && doc.getTextWidth(t + '\u2026') > maxW) t = t.slice(0, -1);
        t += '\u2026';
      }

      doc.setTextColor(60);
      doc.text(t, margin, y);
      doc.setTextColor(120);
      doc.text(pageStr, pageWidth - margin, y, { align: 'right' });
      y += 7;
    }

    y += 4; // gap between categories
  }
}

export function generateCookbookPDF(cookbook, recipes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;

  // Page 1: cover (no page number)
  addCookbookCover(doc, cookbook, recipes.length, pageWidth, pageHeight, margin);

  if (recipes.length === 0) {
    return doc.output('blob');
  }

  const groups = groupByCategory(recipes);
  const tocPageCount = estimateTocPages(groups, pageHeight, margin);

  // Reserve pages 2..1+tocPageCount for the TOC (filled in later)
  for (let i = 0; i < tocPageCount; i++) {
    doc.addPage();
  }

  // Chapter separator pages + recipe pages
  const tocData = [];
  for (const [category, catRecipes] of groups) {
    // Chapter separator
    doc.addPage();
    const chapterDisplayPage = doc.internal.getNumberOfPages() - 1;
    addChapterPage(doc, category, pageWidth, pageHeight, margin);

    const entry = { category, page: chapterDisplayPage, recipes: [] };

    for (const recipe of catRecipes) {
      doc.addPage();
      const recipeDisplayPage = doc.internal.getNumberOfPages() - 1;
      entry.recipes.push({ title: recipe.title || 'Unbekanntes Rezept', page: recipeDisplayPage });
      addRecipeToDoc(doc, recipe);
      // addRecipeToDoc may add overflow pages via checkPageBreak — those get numbers below
    }

    tocData.push(entry);
  }

  // Fill in TOC content on the reserved pages
  renderToc(doc, tocData, 2, tocPageCount, pageWidth, pageHeight, margin, contentWidth);

  // Page numbers on all pages except the cover (page 1)
  const total = doc.internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(160);
    doc.text(String(p - 1), pageWidth / 2, pageHeight - 7, { align: 'center' });
  }

  return doc.output('blob');
}

function addRecipeToDoc(doc, recipeData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(recipeData.title || 'Rezept', contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 9 + 4;

  // Meta info row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  const metaParts = [];
  if (recipeData.category) metaParts.push(recipeData.category);
  if (recipeData.origin) metaParts.push(recipeData.origin);
  if (recipeData.prepTime) metaParts.push(`${recipeData.prepTime} Min.`);
  if (recipeData.difficulty) metaParts.push(recipeData.difficulty);
  if (recipeData.servings) metaParts.push(`${recipeData.servings} Portionen`);
  if (metaParts.length) {
    doc.text(metaParts.join('  |  '), margin, y);
    y += 8;
  }

  // Description
  if (recipeData.description) {
    doc.setTextColor(80);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    const descLines = doc.splitTextToSize(recipeData.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 6;
  }

  doc.setTextColor(0);

  // Ingredients
  if (recipeData.ingredients && recipeData.ingredients.length > 0) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Zutaten', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const ing of recipeData.ingredients) {
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(`•  ${ing}`, margin + 2, y);
      y += 6;
    }
    y += 4;
  }

  // Recipe text
  if (recipeData.recipeText) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Zubereitung', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const steps = splitIntoSteps(recipeData.recipeText);
    const alreadyNumbered = steps.length > 1 && /^\d+[.)]\s/.test(steps[0]);
    for (let idx = 0; idx < steps.length; idx++) {
      const label = alreadyNumbered ? '' : `${idx + 1}. `;
      const indent = alreadyNumbered ? 0 : doc.getTextWidth(label);
      const stepLines = doc.splitTextToSize(label + steps[idx], contentWidth);
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(stepLines[0], margin, y);
      for (let i = 1; i < stepLines.length; i++) {
        y += 5.5;
        y = checkPageBreak(doc, y, 7, margin);
        doc.text(stepLines[i], margin + indent, y);
      }
      y += 5.5;
    }
    y += 4;
  }

  // Tags
  if (recipeData.tags && recipeData.tags.length > 0) {
    y = checkPageBreak(doc, y, 10, margin);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Tags: ' + recipeData.tags.join(', '), margin, y);
    y += 5;
  }

  // Sides
  if (recipeData.sides && recipeData.sides.length > 0) {
    y = checkPageBreak(doc, y, 10, margin);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Passende Beilagen: ' + recipeData.sides.join(', '), margin, y);
  }
}

export function generateRecipePDF(recipeData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: recipeData.title || 'Rezept' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(recipeData.title || 'Rezept', contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 9 + 4;

  // Meta info row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  const metaParts = [];
  if (recipeData.category) metaParts.push(recipeData.category);
  if (recipeData.origin) metaParts.push(recipeData.origin);
  if (recipeData.prepTime) metaParts.push(`${recipeData.prepTime} Min.`);
  if (recipeData.difficulty) metaParts.push(recipeData.difficulty);
  if (recipeData.servings) metaParts.push(`${recipeData.servings} Portionen`);
  if (metaParts.length) {
    doc.text(metaParts.join('  |  '), margin, y);
    y += 8;
  }

  // Description
  if (recipeData.description) {
    doc.setTextColor(80);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    const descLines = doc.splitTextToSize(recipeData.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 6;
  }

  doc.setTextColor(0);

  // Ingredients
  if (recipeData.ingredients && recipeData.ingredients.length > 0) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Zutaten', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const ing of recipeData.ingredients) {
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(`•  ${ing}`, margin + 2, y);
      y += 6;
    }
    y += 4;
  }

  // Recipe text (instructions)
  if (recipeData.recipeText) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Zubereitung', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const steps = splitIntoSteps(recipeData.recipeText);
    const alreadyNumbered = steps.length > 1 && /^\d+[.)]\s/.test(steps[0]);
    for (let idx = 0; idx < steps.length; idx++) {
      const label = alreadyNumbered ? '' : `${idx + 1}. `;
      const indent = alreadyNumbered ? 0 : doc.getTextWidth(label);
      const stepLines = doc.splitTextToSize(label + steps[idx], contentWidth);
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(stepLines[0], margin, y);
      for (let i = 1; i < stepLines.length; i++) {
        y += 5.5;
        y = checkPageBreak(doc, y, 7, margin);
        doc.text(stepLines[i], margin + indent, y);
      }
      y += 5.5;
    }
    y += 4;
  }

  // Notes
  const noteTexts = (recipeData.notes || []).map(n => n.text).filter(Boolean);
  if (noteTexts.length > 0) {
    y = checkPageBreak(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Notizen', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const text of noteTexts) {
      const lines = doc.splitTextToSize(text, contentWidth);
      for (const line of lines) {
        y = checkPageBreak(doc, y, 7, margin);
        doc.text(line, margin, y);
        y += 5.5;
      }
      y += 3;
    }
  }

  // Tags
  if (recipeData.tags && recipeData.tags.length > 0) {
    y = checkPageBreak(doc, y, 10, margin);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Tags: ' + recipeData.tags.join(', '), margin, y);
    y += 5;
  }

  // Sides
  if (recipeData.sides && recipeData.sides.length > 0) {
    y = checkPageBreak(doc, y, 10, margin);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Passende Beilagen: ' + recipeData.sides.join(', '), margin, y);
  }

  return doc.output('blob');
}

function checkPageBreak(doc, y, neededSpace, margin) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededSpace > pageHeight - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

// --- A5 "Zettelkasten" template – A4 landscape, overflow into right column if needed ---
// Same visual layout as A4, but with proportionally smaller font sizes.

export function generateRecipeA5PDF(recipeData) {
  // A4 landscape: 297 × 210 mm (two A5 halves side by side)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  doc.setProperties({ title: recipeData.title || 'Rezept' });
  const pageWidth  = doc.internal.pageSize.getWidth();   // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight();  // 210 mm
  const marginLeft = 25; // wider for hole punch (both sides – left col left edge, right col left edge)
  const marginOther = 14;
  const halfWidth = pageWidth / 2; // 148.5 mm – physical center / cut line
  const colWidth = halfWidth - marginLeft - marginOther; // ~109.5 mm per column
  const leftX  = marginLeft;
  const rightX = halfWidth + marginLeft; // right col starts 25 mm right of center
  const maxY   = pageHeight - marginOther;

  // A5 font sizes – proportionally smaller than A4 (A5 is ~73% of A4 width)
  const fs = { title: 16, section: 10, body: 9, meta: 8, small: 7 };

  let x = leftX;
  let y = marginOther + 4;
  let inRightCol = false;

  function drawSeparator() {
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(halfWidth, marginOther, halfWidth, pageHeight - marginOther);
  }

  function switchToRightCol() {
    inRightCol = true;
    x = rightX;
    y = marginOther + 4;
    drawSeparator();
  }

  function switchToNextPage() {
    doc.addPage();
    inRightCol = false;
    x = leftX;
    y = marginOther + 4;
  }

  function ensureSpace(needed) {
    if (y + needed > maxY) {
      if (!inRightCol) switchToRightCol();
      else switchToNextPage();
    }
  }

  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fs.title);
  const titleLines = doc.splitTextToSize(recipeData.title || 'Rezept', colWidth);
  doc.text(titleLines, x, y);
  y += titleLines.length * 7 + 3;

  // Meta
  const metaParts = [];
  if (recipeData.category) metaParts.push(recipeData.category);
  if (recipeData.origin) metaParts.push(recipeData.origin);
  if (recipeData.prepTime) metaParts.push(`${recipeData.prepTime} Min.`);
  if (recipeData.difficulty) metaParts.push(recipeData.difficulty);
  if (recipeData.servings) metaParts.push(`${recipeData.servings} Portionen`);
  if (metaParts.length > 0) {
    ensureSpace(7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs.meta);
    doc.setTextColor(100);
    doc.text(metaParts.join('  |  '), x, y);
    y += 5;
  }

  doc.setTextColor(0);
  y += 2;

  // Description
  if (recipeData.description) {
    ensureSpace(10);
    doc.setTextColor(80);
    doc.setFontSize(fs.body);
    doc.setFont('helvetica', 'italic');
    const descLines = doc.splitTextToSize(recipeData.description, colWidth);
    doc.text(descLines, x, y);
    y += descLines.length * 4.5 + 4;
    doc.setTextColor(0);
  }

  // Ingredients
  if (recipeData.ingredients && recipeData.ingredients.length > 0) {
    ensureSpace(fs.section + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs.section);
    doc.setTextColor(0);
    doc.text('Zutaten', x, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs.body);
    for (const ing of recipeData.ingredients) {
      const ingLines = doc.splitTextToSize(`•  ${ing}`, colWidth - 2);
      ensureSpace(ingLines.length * 4.5 + 1);
      doc.text(ingLines, x + 2, y);
      y += ingLines.length * 4.5 + 1;
    }
    y += 3;
  }

  // Preparation
  if (recipeData.recipeText) {
    ensureSpace(fs.section + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs.section);
    doc.setTextColor(0);
    doc.text('Zubereitung', x, y);
    y += 6;

    const steps = splitIntoSteps(recipeData.recipeText);
    const alreadyNumbered = steps.length > 1 && /^\d+[.)]\s/.test(steps[0]);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs.body);
    for (let idx = 0; idx < steps.length; idx++) {
      const label = alreadyNumbered ? '' : `${idx + 1}. `;
      const indent = alreadyNumbered ? 0 : doc.getTextWidth(label);
      const lines = doc.splitTextToSize(label + steps[idx], colWidth);
      ensureSpace(4.5 * lines.length);
      doc.text(lines[0], x, y);
      for (let i = 1; i < lines.length; i++) {
        y += 4.5;
        ensureSpace(4.5);
        doc.text(lines[i], x + indent, y);
      }
      y += 5;
    }
    y += 3;
  }

  // Notes
  const noteTextsA5 = (recipeData.notes || []).map(n => n.text).filter(Boolean);
  if (noteTextsA5.length > 0) {
    ensureSpace(fs.section + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs.section);
    doc.setTextColor(0);
    doc.text('Notizen', x, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs.body);
    for (const text of noteTextsA5) {
      const lines = doc.splitTextToSize(text, colWidth);
      for (const line of lines) {
        ensureSpace(4.5);
        doc.text(line, x, y);
        y += 4.5;
      }
      y += 3;
    }
  }

  // Tags
  if (recipeData.tags && recipeData.tags.length > 0) {
    ensureSpace(6);
    doc.setFontSize(fs.small);
    doc.setTextColor(120);
    doc.text('Tags: ' + recipeData.tags.join(', '), x, y);
    y += 4;
  }

  // Sides
  if (recipeData.sides && recipeData.sides.length > 0) {
    ensureSpace(6);
    doc.setFontSize(fs.small);
    doc.setTextColor(120);
    doc.text('Passende Beilagen: ' + recipeData.sides.join(', '), x, y);
  }

  return doc.output('blob');
}
