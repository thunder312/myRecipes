import { jsPDF } from 'jspdf';

function splitIntoSteps(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = text.split(/;\s+|\.\s+(?=[A-ZÜÄÖ])/);
  const result = parts.map(s => s.trim()).filter(Boolean);
  return result.length > 1 ? result : lines;
}

export function generateCookbookPDF(cookbook, recipes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // --- Cover page ---
  doc.setFillColor(40); // dark grey
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  const coverTitle = cookbook.coverTitle || cookbook.name || 'Kochbuch';
  const titleLines = doc.splitTextToSize(coverTitle, pageWidth - 2 * margin);
  const titleY = pageHeight / 2 - titleLines.length * 18 / 2;
  doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

  if (cookbook.coverSubtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(18);
    doc.text(cookbook.coverSubtitle, pageWidth / 2, titleY + titleLines.length * 18 + 8, { align: 'center' });
  }

  // Recipe count
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(180);
  doc.text(`${recipes.length} Rezept${recipes.length !== 1 ? 'e' : ''}`, pageWidth / 2, pageHeight - 30, { align: 'center' });

  // Description
  if (cookbook.description) {
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    const descLines = doc.splitTextToSize(cookbook.description, pageWidth - 2 * margin);
    doc.text(descLines, pageWidth / 2, pageHeight - 50, { align: 'center' });
  }

  // --- Table of contents ---
  if (recipes.length > 0) {
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Inhaltsverzeichnis', margin, margin + 5);

    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 10, pageWidth - margin, margin + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    let tocY = margin + 20;

    recipes.forEach((r, idx) => {
      if (tocY > pageHeight - margin) {
        doc.addPage();
        tocY = margin + 10;
      }
      const num = String(idx + 1).padStart(2, ' ');
      const title = r.title || 'Unbekanntes Rezept';
      const meta = [r.category, r.prepTime ? `${r.prepTime} Min.` : null].filter(Boolean).join(' · ');
      doc.setTextColor(80);
      doc.text(`${num}.`, margin, tocY);
      doc.setTextColor(0);
      doc.text(title, margin + 10, tocY);
      if (meta) {
        doc.setTextColor(140);
        doc.setFontSize(9);
        doc.text(meta, margin + 10, tocY + 4);
        doc.setFontSize(11);
      }
      tocY += meta ? 10 : 7;
    });
  }

  // --- Recipe pages ---
  for (const recipe of recipes) {
    doc.addPage();
    addRecipeToDoc(doc, recipe);
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
  y += titleLines.length * 9 + 2;

  // Divider
  doc.setDrawColor(80);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  y += 10;

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
    y = checkPageBreak(doc, y, 15, margin);
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
  y += titleLines.length * 9 + 2;

  // Divider
  doc.setDrawColor(80);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  y += 10;

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

  // Tags
  if (recipeData.tags && recipeData.tags.length > 0) {
    y = checkPageBreak(doc, y, 15, margin);
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
  const marginLeft = 25; // wider for hole punch
  const marginOther = 14;
  const colGap  = 10;
  const colWidth = (pageWidth - marginLeft - marginOther - colGap) / 2; // ~124 mm
  const leftX  = marginLeft;
  const rightX = marginLeft + colWidth + colGap;
  const maxY   = pageHeight - marginOther;

  // A5 font sizes – proportionally smaller than A4 (A5 is ~73% of A4 width)
  const fs = { title: 16, section: 10, body: 9, meta: 8, small: 7 };

  let x = leftX;
  let y = marginOther + 4;
  let inRightCol = false;

  function switchToRightCol() {
    if (inRightCol) return;
    inRightCol = true;
    x = rightX;
    y = marginOther + 4;
    const sepX = marginLeft + colWidth + colGap / 2;
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(sepX, marginOther, sepX, pageHeight - marginOther);
  }

  function ensureSpace(needed) {
    if (y + needed > maxY) switchToRightCol();
  }

  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fs.title);
  const titleLines = doc.splitTextToSize(recipeData.title || 'Rezept', colWidth);
  doc.text(titleLines, x, y);
  y += titleLines.length * 7 + 1;

  // Divider (same style as A4, grayscale)
  doc.setDrawColor(80);
  doc.setLineWidth(0.8);
  doc.line(x, y, x + colWidth, y);
  doc.setLineWidth(0.3);
  doc.setDrawColor(200);
  y += 6;

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
    doc.setTextColor(0);
  }

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
      if (y > maxY) break;
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
      if (y > maxY) break;
      doc.text(lines[0], x, y);
      for (let i = 1; i < lines.length; i++) {
        y += 4.5;
        doc.text(lines[i], x + indent, y);
      }
      y += 5;
    }
    y += 3;
  }

  // Tags
  if (recipeData.tags && recipeData.tags.length > 0) {
    ensureSpace(6);
    if (y <= maxY) {
      doc.setFontSize(fs.small);
      doc.setTextColor(120);
      doc.text('Tags: ' + recipeData.tags.join(', '), x, y);
      y += 4;
    }
  }

  // Sides
  if (recipeData.sides && recipeData.sides.length > 0) {
    ensureSpace(6);
    if (y <= maxY) {
      doc.setFontSize(fs.small);
      doc.setTextColor(120);
      doc.text('Passende Beilagen: ' + recipeData.sides.join(', '), x, y);
    }
  }

  return doc.output('blob');
}
