import { jsPDF } from 'jspdf';

export function generateCookbookPDF(cookbook, recipes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // --- Cover page ---
  doc.setFillColor(249, 115, 22); // brand orange
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
  doc.setTextColor(255, 230, 210);
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
  y += titleLines.length * 9 + 4;

  // Divider
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  y += 8;

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
    const lines = doc.splitTextToSize(recipeData.recipeText, contentWidth);
    for (const line of lines) {
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(line, margin, y);
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

  // Divider
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

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
    const lines = doc.splitTextToSize(recipeData.recipeText, contentWidth);
    for (const line of lines) {
      y = checkPageBreak(doc, y, 7, margin);
      doc.text(line, margin, y);
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

// --- A5 "Zettelkasten" template ---

export function generateRecipeA5PDF(recipeData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 148 mm
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin + 4;

  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(recipeData.title || 'Rezept', contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 6.5 + 4;

  // Ingredients header
  if (recipeData.ingredients && recipeData.ingredients.length > 0) {
    y = checkPageBreak(doc, y, 12, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const portionSuffix = recipeData.servings ? ` für ${recipeData.servings} ${recipeData.servings === 1 ? 'Person' : 'Personen'}` : '';
    doc.text(`Zutaten${portionSuffix}:`, margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const ing of recipeData.ingredients) {
      y = checkPageBreak(doc, y, 5.5, margin);
      const ingLines = doc.splitTextToSize(ing, contentWidth - 4);
      doc.text(ingLines, margin + 4, y);
      y += ingLines.length * 5 + 1;
    }
    y += 3;
  }

  // Preparation header
  if (recipeData.recipeText) {
    y = checkPageBreak(doc, y, 12, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Zubereitung:', margin, y);
    y += 6;

    // Split into numbered steps: split on newlines, filter blank lines
    const rawSteps = recipeData.recipeText.split('\n').map(s => s.trim()).filter(Boolean);
    // If steps already start with numbers (e.g. "1. ..."), keep as-is; otherwise add numbering
    const alreadyNumbered = rawSteps.length > 1 && /^\d+[.)]\s/.test(rawSteps[0]);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    rawSteps.forEach((step, idx) => {
      const cleanStep = alreadyNumbered ? step : step;
      const label = alreadyNumbered ? '' : `${idx + 1}. `;
      const fullText = label + cleanStep;
      const indent = alreadyNumbered ? 0 : doc.getTextWidth(`${idx + 1}. `) + 1;
      const lines = doc.splitTextToSize(fullText, contentWidth);
      // For wrapped lines, indent continuation
      y = checkPageBreak(doc, y, 5.5 * lines.length, margin);
      if (lines.length === 1) {
        doc.text(lines[0], margin, y);
        y += 5.5;
      } else {
        doc.text(lines[0], margin, y);
        for (let i = 1; i < lines.length; i++) {
          y += 5;
          doc.text(lines[i], margin + indent, y);
        }
        y += 5.5;
      }
    });
    y += 2;
  }

  // Footer: tags/sides in small grey text
  const footerParts = [];
  if (recipeData.category) footerParts.push(recipeData.category);
  if (recipeData.prepTime) footerParts.push(`${recipeData.prepTime} Min.`);
  if (recipeData.tags && recipeData.tags.length > 0) footerParts.push(...recipeData.tags);
  if (footerParts.length > 0) {
    y = checkPageBreak(doc, y, 8, margin);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(footerParts.join('  ·  '), margin, y);
  }

  return doc.output('blob');
}
