// ============================================================
// Concetto — Generatore Edizioni Quotidiane
// ============================================================
const fs = require('fs');
const path = require('path');

const ZAI_KEY = process.env.ZAI_API_KEY;
if (!ZAI_KEY) {
  console.error('Manca la variabile d\'ambiente ZAI_API_KEY (va impostata come Secret su GitHub).');
  process.exit(1);
}

const CATEGORIES = [
  { id: 'italia',    label: 'Italia',              kind: 'topic',  topic: 'NATION' },
  { id: 'esteri',    label: 'Esteri',               kind: 'topic',  topic: 'WORLD' },
  { id: 'economia',  label: 'Economia',             kind: 'topic',  topic: 'BUSINESS' },
  { id: 'tecnologia',label: 'Tecnologia',           kind: 'topic',  topic: 'TECHNOLOGY' },
  { id: 'sport',     label: 'Sport',                kind: 'topic',  topic: 'SPORTS' },
  { id: 'cultura',   label: 'Cultura & Spettacolo', kind: 'topic',  topic: 'ENTERTAINMENT' },
  { id: 'gossip',    label: 'Gossip',               kind: 'search', query: 'gossip vip celebrità' },
  { id: 'ambiente',  label: 'Ambiente',             kind: 'search', query: 'ambiente sostenibilità clima' },
  { id: 'moda',      label: 'Moda & Lifestyle',     kind: 'search', query: 'moda lifestyle design italia' },
  { id: 'concettoplus', label: 'Concetto+',         kind: 'plus' },
];

function googleNewsUrl(cat) {
  if (cat.kind === 'topic') {
    return `https://news.google.com/rss/headlines/section/topic/${cat.topic}?hl=it&gl=IT&ceid=IT:it`;
  }
  if (cat.kind === 'search') {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query)}&hl=it&gl=IT&ceid=IT:it`;
  }
  return null;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}

function extractTitles(xmlText, count) {
  const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items
    .slice(0, count)
    .map(item => {
      const m = item.match(/<title>([\s\S]*?)<\/title>/);
      return m ? decodeEntities(m[1]).trim() : null;
    })
    .filter(Boolean);
}

async function fetchHeadlines(url, count) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConcettoBot/1.0; +https://concetto.app)' }
    });
    const xml = await res.text();
    return extractTitles(xml, count);
  } catch (err) {
    console.error('Errore nel recupero feed:', url, err.message);
    return [];
  }
}

function buildPrompt(headlines, isPlus, categoryLabel) {
  const list = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const contextLine = isPlus
    ? 'Ecco un elenco di titoli reali, raccolti in questo momento da testate estere (edizioni internazionali) che parlano dell\'Italia:'
    : `Ecco un elenco di titoli di notizie reali, raccolti in questo momento sulla categoria "${categoryLabel}":`;

  return `Sei un sistema editoriale che sintetizza notizie reali in una singola frase italiana.

${contextLine}
${list}

1. Da questi titoli individua il tema principale (non serve usarli tutti se sono ridondanti).
2. Scrivi UNA sola frase in italiano, scorrevole e naturale (30-42 parole), che condensi il senso dei titoli: non un elenco, una frase editoriale unica.
3. Scomponi quella frase in segmenti ordinati che, concatenati esattamente nell'ordine dato, ricostruiscono la frase completa con la sua spaziatura e punteggiatura naturale. Ogni segmento è un oggetto con:
   - "text": il testo del segmento
   - "type": uno tra "plain", "unusual", "date", "name", "deepdive"
     - "unusual": una parola o espressione poco comune, tecnica o ricercata
     - "date": una data o riferimento temporale
     - "name": il nome proprio di una persona, organizzazione, luogo o istituzione
     - "deepdive": un concetto denso, che meriterebbe un approfondimento a parte
   - per ogni tipo diverso da "plain", aggiungi anche "detail": una frase breve (max 20 parole) che spiega o contestualizza specificamente quel segmento
4. Scrivi anche un "aforisma": una frase riflessiva breve (max 16 parole), in italiano, che risuoni semanticamente con il tema di fondo — non una parafrasi letterale.
5. Inventa anche un "autore" per l'aforisma: un nome e cognome di fantasia, chiaramente inventato. Non usare MAI il nome di una persona reale o pubblica esistente.
6. Scrivi anche un "approfondimento": due frasi (massimo 40 parole in totale) che sviluppano più a fondo il tema "deepdive".

Rispondi SOLO con un oggetto JSON valido, nessun markdown, nessun backtick, nessun testo introduttivo o finale, in questa forma esatta:
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"..."}

Assicurati che la concatenazione di tutti i "text" in ordine ricomponga esattamente la frase, con spazi naturali tra le parole.`;
}

async function callZai(promptText) {
  const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZAI_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4.7-flash',
      messages: [{ role: 'user', content: promptText }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`[HTTP ${response.status}] ${data.error.message || 'Errore Z.ai'}`);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Risposta vuota da Z.ai.');
  return content.trim();
}

function parseModelJson(rawText) {
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.segments || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    throw new Error('Risposta senza segmenti validi.');
  }
  return parsed;
}

async function generateCategory(cat) {
  console.log(`→ Genero: ${cat.label}`);
  let headlines;

  if (cat.kind === 'plus') {
    const urlEn = 'https://news.google.com/rss/search?q=' + encodeURIComponent('Italy') + '&hl=en-US&gl=US&ceid=US:en';
    const urlJa = 'https://news.google.com/rss/search?q=' + encodeURIComponent('Italy') + '&hl=ja&gl=JP&ceid=JP:ja';
    const [en, ja] = await Promise.all([
      fetchHeadlines(urlEn, 12),
      fetchHeadlines(urlJa, 12),
    ]);
    headlines = [...en, ...ja];
  } else {
    headlines = await fetchHeadlines(googleNewsUrl(cat), 18);
  }

  if (!headlines.length) {
    throw new Error(`Nessun titolo recuperato per "${cat.label}".`);
  }

  const promptText = buildPrompt(headlines, cat.kind === 'plus', cat.label);
  const rawText = await callZai(promptText);
  const parsed = parseModelJson(rawText);

  return {
    id: cat.id,
    label: cat.label,
    ...parsed
  };
}

async function main() {
  const results = {};
  const errors = [];

  for (const cat of CATEGORIES) {
    try {
      results[cat.id] = await generateCategory(cat);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`✗ Errore su "${cat.label}":`, err.message);
      errors.push({ categoria: cat.label, errore: err.message });
    }
  }

  const now = new Date();
  const dataISO = now.toISOString().split('T')[0];
  const output = {
    generato_il: now.toISOString(),
    data: dataISO,
    categorie: results,
    errori: errors.length ? errors : undefined
  };

  const dataDir = path.join(__dirname, '..', 'data');
  const archivioDir = path.join(dataDir, 'archivio');
  fs.mkdirSync(archivioDir, { recursive: true });

  fs.writeFileSync(path.join(dataDir, 'oggi.json'), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(archivioDir, `${dataISO}.json`), JSON.stringify(output, null, 2));

  console.log(`\nFatto. ${Object.keys(results).length}/${CATEGORIES.length} categorie generate.`);
  if (errors.length) {
    console.log('Categorie con errori:', errors.map(e => e.categoria).join(', '));
  }
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
