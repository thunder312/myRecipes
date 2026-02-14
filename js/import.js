import { analyzeRecipeText, analyzeRecipeImage } from './api.js';

export async function processURL(url) {
  // Try direct fetch first, then CORS proxy
  let html;
  try {
    const resp = await fetch(url);
    html = await resp.text();
  } catch {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      html = await resp.text();
    } catch {
      throw new Error('URL konnte nicht geladen werden. Bitte kopiere den Rezepttext und füge ihn als Text ein.');
    }
  }

  // Strip HTML tags to get plain text
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body.innerText || doc.body.textContent || '';

  if (text.trim().length < 50) {
    throw new Error('Zu wenig Text auf der Seite gefunden. Bitte kopiere den Rezepttext manuell.');
  }

  const results = await analyzeRecipeText(text);
  return tagResults(results, 'url', url);
}

export async function processPDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfjsVersion = pdfjsLib.version;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  if (fullText.trim().length < 20) {
    // PDF might be image-based, convert first page to image
    const page = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    const results = await analyzeRecipeImage(base64, 'image/png');
    return tagResults(results, 'pdf', file.name);
  }

  const results = await analyzeRecipeText(fullText);
  return tagResults(results, 'pdf', file.name);
}

export async function processImage(file) {
  const base64 = await fileToBase64(file);
  const mediaType = file.type || 'image/jpeg';
  const results = await analyzeRecipeImage(base64, mediaType);
  return tagResults(results, 'image', file.name);
}

export async function processText(text) {
  const results = await analyzeRecipeText(text);
  return tagResults(results, 'text', 'Manueller Text');
}

/**
 * Setzt sourceType und sourceRef auf jedes Ergebnis im Array.
 */
function tagResults(results, sourceType, sourceRef) {
  for (const r of results) {
    r.sourceType = sourceType;
    r.sourceRef = sourceRef;
  }
  return results;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
