const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' };

async function run() {
  const searchUrl = 'https://www.chefkoch.de/rs/s0/big+mac+salat/Rezepte.html';
  const searchHtml = await fetch(searchUrl, { headers }).then(r => r.text());

  // Rezept-Bild-URLs direkt aus der Suchergebnisseite (CDN-Pattern mit /rezepte/ID/bilder/)
  const recipeImages = [...new Set(
    searchHtml.match(/https:\/\/img\.chefkoch-cdn\.de\/rezepte\/\d+\/bilder\/\d+\/[^"'\s]+\.jpg/g) || []
  )];
  console.log('=== Rezept-Bilder direkt aus Suchseite ===');
  recipeImages.slice(0, 8).forEach(u => console.log(u));

  // __NEXT_DATA__ JSON (Next.js SSR-Daten)
  const nextDataMatch = searchHtml.match(/<script id="__NEXT_DATA__"[^>]*>(\{.*?\})<\/script>/s);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      console.log('\n=== __NEXT_DATA__ vorhanden – Tiefe 2 Keys ===');
      const props = data?.props?.pageProps;
      console.log(Object.keys(props || {}).join(', '));
    } catch { console.log('__NEXT_DATA__ parse error'); }
  } else {
    console.log('\n=== Kein __NEXT_DATA__ gefunden ===');
  }
}

run().catch(console.error);
