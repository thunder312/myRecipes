import { jsPDF } from 'jspdf';

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
