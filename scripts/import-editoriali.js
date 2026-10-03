// ============================================================
// Concètto — Importazione degli editoriali dei giornalisti
// ============================================================
// I giornalisti scrivono in un Modulo Google; le risposte finiscono in un Foglio
// che viene "pubblicato sul web" in formato CSV. Questo script (gira su GitHub
// Actions, ogni ora) legge quel CSV e per ogni editoriale APPROVATO crea:
//   - data/editoriali/<slug>.json      il testo salvato per sempre (archivio)
//   - editoriali/<slug>/index.html     la pagina pubblica, ottimizzata per la SEO
//   - editoriali/index.html            l'archivio di tutti gli editoriali
//   - data/editoriali.json             elenco per la prima pagina
//   - sitemap.xml, robots.txt, feed-editoriali.xml
//
// Variabili: EDITORIALI_CSV_URL (Secret) e SITE_URL (Variable, es. https://concetto.vangard.it/)
// Regole: una riga del Foglio viene pubblicata solo se nella colonna "Pubblica"
// c'è "sì". Se poi si cambia in "ritira" (o si svuota) la pagina viene tolta.
// Un editoriale già pubblicato non viene mai cancellato se la riga sparisce dal Foglio.
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIR_JSON = path.join(ROOT, 'data', 'editoriali');
const DIR_PAGINE = path.join(ROOT, 'editoriali');
const env = n => String(process.env[n] || '').trim();

const SITE_URL = (env('SITE_URL') || 'https://concetto-giornale.github.io/concetto-test-1/').replace(/\/*$/, '/');
const NOME_SITO = 'Concètto';

// ---------- CSV (RFC 4180: virgolette, virgole e a capo dentro le celle) ----------
function leggiCsv(testo) {
  const t = String(testo).replace(/^\uFEFF/, '');
  const righe = [];
  let riga = [], cella = '', dentro = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) {
      if (c === '"') {
        if (t[i + 1] === '"') { cella += '"'; i++; } else dentro = false;
      } else cella += c;
    } else if (c === '"') dentro = true;
    else if (c === ',') { riga.push(cella); cella = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      riga.push(cella); cella = '';
      if (riga.some(x => x.trim() !== '')) righe.push(riga);
      riga = [];
    } else cella += c;
  }
  riga.push(cella);
  if (riga.some(x => x.trim() !== '')) righe.push(riga);
  return righe;
}

const senzaAccenti = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const chiaveColonna = h => senzaAccenti(h).toLowerCase().replace(/[^a-z0-9]/g, '');

// Riconosce le colonne anche se il titolo della domanda è più lungo ("Titolo dell'editoriale")
function campoDi(intestazione) {
  const k = chiaveColonna(intestazione);
  if (!k) return null;
  if (k.includes('cronolog') || k === 'timestamp' || k.startsWith('marcatemporale')) return 'ts';
  if (k.startsWith('titolo')) return 'titolo';
  if (k.startsWith('autore') || k.startsWith('firma') || k.startsWith('nome')) return 'autore';
  if (k.startsWith('sommario') || k.startsWith('occhiello') || k.startsWith('sottotitolo') || k.startsWith('riassunto') || k.startsWith('descrizione')) return 'sommario';
  if (k.startsWith('testo') || k.startsWith('articolo') || k.startsWith('contenuto')) return 'testo';
  if (k.startsWith('pubblic') || k.startsWith('approv') || k.startsWith('stato')) return 'pubblica';
  if (k.startsWith('data')) return 'data';
  if (k.startsWith('slug')) return 'slug';
  return null;
}

function righeComeOggetti(righe) {
  if (righe.length < 2) return [];
  const campi = righe[0].map(campoDi);
  return righe.slice(1).map(r => {
    const o = {};
    campi.forEach((c, i) => { if (c && o[c] === undefined) o[c] = (r[i] || '').trim(); });
    return o;
  });
}

const APPROVATO = new Set(['si', 's', 'yes', 'y', 'true', 'ok', 'x', '1', 'pubblica', 'pubblicato', 'approvato']);
const approvato = v => APPROVATO.has(senzaAccenti(v).toLowerCase().trim());

// ---------- date e indirizzi ----------
function oggiRoma() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dataIso(v) {
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let a, mm, g;
  if (m) { a = +m[1]; mm = +m[2]; g = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/))) { g = +m[1]; mm = +m[2]; a = +m[3]; }
  else return null;
  const d = new Date(Date.UTC(a, mm - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== g) return null;
  return `${a}-${String(mm).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}

function slugify(s) {
  let r = senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (r.length > 70) r = r.slice(0, 70).replace(/-[^-]*$/, '');
  return r || 'editoriale';
}

const hashContenuto = o => crypto.createHash('sha1').update(JSON.stringify([o.titolo, o.autore, o.sommario, o.testo, o.data])).digest('hex');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escXml = s => esc(s).replace(/'/g, '&apos;');

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function dataLunga(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  return `${g} ${MESI[m - 1]} ${a}`;
}

// ---------- testo -> HTML (paragrafi; "## " all'inizio = sottotitolo) ----------
function testoInHtml(testo) {
  return String(testo).replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => {
    if (p.startsWith('## ')) return `<h2>${esc(p.slice(3).trim())}</h2>`;
    return `<p>${esc(p).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}
const testoPiano = t => String(t).replace(/\r/g, '').replace(/^## /gm, '').replace(/\s+/g, ' ').trim();
function accorcia(t, max) {
  const s = testoPiano(t);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '') + '…';
}

// ---------- archivio su disco ----------
function caricaEsistenti() {
  const mappa = new Map();
  if (!fs.existsSync(DIR_JSON)) return mappa;
  for (const f of fs.readdirSync(DIR_JSON)) {
    if (!f.endsWith('.json')) continue;
    try {
      const e = JSON.parse(fs.readFileSync(path.join(DIR_JSON, f), 'utf8'));
      if (e && e.slug && e.titolo) mappa.set(e.slug, e);
    } catch (_) { console.warn(`File non valido ignorato: ${f}`); }
  }
  return mappa;
}

function salvaJson(e) {
  fs.mkdirSync(DIR_JSON, { recursive: true });
  fs.writeFileSync(path.join(DIR_JSON, `${e.slug}.json`), JSON.stringify(e, null, 2) + '\n');
}

// ---------- importazione ----------
async function leggiFonte() {
  const file = env('EDITORIALI_CSV_FILE');           // solo per le prove in locale
  if (file) return fs.readFileSync(file, 'utf8');
  const url = env('EDITORIALI_CSV_URL');
  if (!url) return null;
  const res = await fetch(url, { headers: { 'User-Agent': 'ConcettoBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const testo = await res.text();
  if (/<html/i.test(testo.slice(0, 300))) throw new Error('La fonte non è un CSV (controlla il link pubblicato)');
  return testo;
}

function importa(righe, esistenti) {
  const perChiave = new Map([...esistenti.values()].map(e => [e.chiave, e]));
  const slugUsati = new Set(esistenti.keys());
  let nuovi = 0, aggiornati = 0, ritirati = 0, saltati = 0;

  for (const r of righe) {
    const titolo = (r.titolo || '').trim();
    const chiave = (r.ts || titolo).trim();
    if (!chiave) continue;
    const esistente = perChiave.get(chiave);
    const ok = approvato(r.pubblica);

    if (!ok) {
      if (esistente && !esistente.ritirato) { esistente.ritirato = true; salvaJson(esistente); ritirati++; console.log(`↩ Ritirato: ${esistente.titolo}`); }
      continue;
    }
    const testo = String(r.testo || '').replace(/\r/g, '').trim();
    if (titolo.length < 3 || testo.length < 120) {
      console.warn(`⚠ Riga saltata (titolo o testo troppo corti): "${titolo.slice(0, 40)}"`);
      saltati++;
      continue;
    }
    const autore = (r.autore || '').trim() || 'La redazione';
    const sommario = (r.sommario || '').replace(/\s+/g, ' ').trim();
    const dataRiga = dataIso(r.data);

    if (esistente) {
      const nuovoDato = { titolo, autore, sommario, testo, data: dataRiga || esistente.data };
      const cambiato = hashContenuto(nuovoDato) !== hashContenuto(esistente) || esistente.ritirato;
      if (cambiato) {
        Object.assign(esistente, nuovoDato, { ritirato: false, aggiornato_il: oggiRoma() });
        salvaJson(esistente);
        aggiornati++;
        console.log(`✎ Aggiornato: ${titolo}`);
      }
      continue;
    }
    // nuovo editoriale: l'indirizzo (slug) viene fissato ora e non cambia più
    let slug = slugify(r.slug || titolo);
    let n = 2;
    while (slugUsati.has(slug)) slug = `${slugify(r.slug || titolo).slice(0, 66)}-${n++}`;
    slugUsati.add(slug);
    const e = { slug, chiave, titolo, autore, sommario, testo, data: dataRiga || oggiRoma(), creato_il: oggiRoma(), aggiornato_il: oggiRoma(), ritirato: false };
    salvaJson(e);
    esistenti.set(slug, e);
    perChiave.set(chiave, e);
    nuovi++;
    console.log(`＋ Nuovo: ${titolo} (${slug})`);
  }
  return { nuovi, aggiornati, ritirati, saltati };
}

// ---------- pagine ----------
const FONT = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Roboto+Condensed:wght@400;700&display=swap';

const CSS = `
:root{--bg:#fff;--ink:#141414;--soft:#262626;--meta:#5f5f5a;--red:#b3121c;--line:#d9d9d6;--link:#0b4a94}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--ink:#f1efe8;--soft:#e6e3d9;--meta:#a9a79c;--red:#ff7075;--line:#34332f;--link:#8dbbff}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:'Source Serif 4',Georgia,serif;-webkit-font-smoothing:antialiased}
.top{max-width:760px;margin:0 auto;padding:22px 20px 12px;text-align:center;border-bottom:3px solid var(--ink)}
.brand{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(40px,8vw,64px);line-height:1;color:var(--ink);text-decoration:none}
.brand em{color:var(--red);font-style:italic;font-weight:700}
.nav{max-width:760px;margin:0 auto;padding:10px 20px;display:flex;gap:18px;justify-content:center;flex-wrap:wrap;border-bottom:1px solid var(--line);font-family:'Roboto Condensed',sans-serif;font-size:13.5px;letter-spacing:.07em;text-transform:uppercase}
.nav a{color:var(--ink);text-decoration:none;font-weight:700}.nav a:hover{color:var(--red)}
main{max-width:720px;margin:0 auto;padding:28px 20px 40px}
.kicker{font-family:'Roboto Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--red);margin-bottom:10px}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(30px,6vw,46px);line-height:1.12;margin-bottom:12px}
.sommario{font-size:20px;line-height:1.5;color:var(--soft);font-style:italic;margin-bottom:16px}
.firma{font-family:'Roboto Condensed',sans-serif;font-size:13.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--meta);padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:24px}
.firma b{color:var(--ink)}
.testo p{font-size:19px;line-height:1.7;color:var(--soft);margin-bottom:18px}
.testo h2{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:26px;line-height:1.25;margin:28px 0 12px}
.testo>p:first-child::first-letter{font-family:'Playfair Display',serif;font-weight:900;float:left;font-size:3.6em;line-height:.85;padding:6px 10px 0 0;color:var(--red)}
.altri{margin-top:34px;padding-top:16px;border-top:3px solid var(--ink);font-family:'Roboto Condensed',sans-serif}
.altri h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--meta);margin-bottom:10px}
.altri a{color:var(--link);font-size:16px}
.lista{list-style:none}.lista li{padding:16px 0;border-bottom:1px solid var(--line)}
.lista a.t{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:24px;line-height:1.2;color:var(--ink);text-decoration:none}
.lista a.t:hover{color:var(--red)}
.lista .m{font-family:'Roboto Condensed',sans-serif;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--meta);margin:6px 0}
.lista p{font-size:17px;line-height:1.5;color:var(--soft)}
footer{max-width:720px;margin:0 auto;padding:18px 20px 40px;border-top:1px solid var(--line);font-family:'Roboto Condensed',sans-serif;font-size:13px;color:var(--meta);text-align:center}
footer a{color:var(--meta)}
`;

function intestazione({ titolo, descrizione, canonico, tipo, extra = '', radice }) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo)}</title>
<meta name="description" content="${esc(descrizione)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonico)}">
<link rel="icon" href="${radice}favicon.ico" sizes="any">
<link rel="alternate" type="application/rss+xml" title="Editoriali di ${NOME_SITO}" href="${SITE_URL}feed-editoriali.xml">
<meta property="og:type" content="${tipo}">
<meta property="og:site_name" content="${NOME_SITO}">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(titolo)}">
<meta property="og:description" content="${esc(descrizione)}">
<meta property="og:url" content="${esc(canonico)}">
<meta property="og:image" content="${SITE_URL}concetto-og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titolo)}">
<meta name="twitter:description" content="${esc(descrizione)}">
<meta name="twitter:image" content="${SITE_URL}concetto-og.png">
${extra}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONT}" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="${radice}">Conc<em>è</em>tto</a></header>
<nav class="nav"><a href="${radice}">Prima pagina</a><a href="${radice}editoriali/">Editoriali</a><a href="${SITE_URL}feed-editoriali.xml">RSS</a></nav>
`;
}

const piede = radice => `<footer><a href="${radice}">${NOME_SITO}</a> · <a href="${radice}editoriali/">Tutti gli editoriali</a> · Un progetto di <a href="https://www.vangard.it" target="_blank" rel="noopener">Vangard</a></footer>
</body>
</html>
`;

function jsonLd(oggetto) {
  return `<script type="application/ld+json">${JSON.stringify(oggetto).replace(/</g, '\\u003c')}</script>\n`;
}

function paginaEditoriale(e, prec, succ) {
  const url = `${SITE_URL}editoriali/${e.slug}/`;
  const descrizione = e.sommario ? accorcia(e.sommario, 160) : accorcia(e.testo, 155);
  const parole = testoPiano(e.testo).split(' ').length;
  const dati = {
    '@context': 'https://schema.org',
    '@type': 'OpinionNewsArticle',
    headline: e.titolo.slice(0, 110),
    description: descrizione,
    inLanguage: 'it',
    datePublished: e.data,
    dateModified: e.aggiornato_il || e.data,
    author: { '@type': 'Person', name: e.autore },
    publisher: { '@type': 'Organization', name: NOME_SITO, logo: { '@type': 'ImageObject', url: `${SITE_URL}apple-touch-icon.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: [`${SITE_URL}concetto-og.png`],
    wordCount: parole,
  };
  const extra = jsonLd(dati) + `<meta property="article:published_time" content="${e.data}">\n<meta property="article:author" content="${esc(e.autore)}">\n`;
  const altri = [prec && `<a href="../${prec.slug}/">\u2190 ${esc(prec.titolo)}</a>`, succ && `<a href="../${succ.slug}/">${esc(succ.titolo)} \u2192</a>`].filter(Boolean).join('<br><br>');
  return intestazione({ titolo: `${e.titolo} — ${NOME_SITO}`, descrizione, canonico: url, tipo: 'article', extra, radice: '../../' }) +
`<main>
<article>
<div class="kicker">Editoriale</div>
<h1>${esc(e.titolo)}</h1>
${e.sommario ? `<p class="sommario">${esc(e.sommario)}</p>` : ''}
<div class="firma">di <b>${esc(e.autore)}</b> · <time datetime="${e.data}">${dataLunga(e.data)}</time> · ${Math.max(1, Math.round(parole / 200))} min di lettura</div>
<div class="testo">
${testoInHtml(e.testo)}
</div>
</article>
<div class="altri"><h2>Altri editoriali</h2>${altri ? altri + '<br><br>' : ''}<a href="../">Tutti gli editoriali \u2192</a></div>
</main>
` + piede('../../');
}

function paginaArchivio(lista) {
  const url = `${SITE_URL}editoriali/`;
  const dati = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Editoriali di ${NOME_SITO}`, url, inLanguage: 'it',
    mainEntity: { '@type': 'ItemList', itemListElement: lista.slice(0, 50).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}editoriali/${e.slug}/`, name: e.titolo })) },
  };
  const voci = lista.map(e => `<li><a class="t" href="${e.slug}/">${esc(e.titolo)}</a><div class="m">di ${esc(e.autore)} · ${dataLunga(e.data)}</div>${e.sommario ? `<p>${esc(accorcia(e.sommario, 220))}</p>` : ''}</li>`).join('\n');
  return intestazione({ titolo: `Editoriali — ${NOME_SITO}`, descrizione: `Tutti gli editoriali di ${NOME_SITO}: opinioni e commenti sull'attualità, firmati dai nostri giornalisti.`, canonico: url, tipo: 'website', extra: jsonLd(dati), radice: '../' }) +
`<main>
<div class="kicker">Archivio</div>
<h1>Gli editoriali di ${NOME_SITO}</h1>
${lista.length ? `<ul class="lista">\n${voci}\n</ul>` : '<p class="sommario">Il primo editoriale arriverà presto.</p>'}
</main>
` + piede('../');
}

function scriviPagine(tutti) {
  const visibili = tutti.filter(e => !e.ritirato)
    .sort((a, b) => (b.data.localeCompare(a.data)) || (b.creato_il || '').localeCompare(a.creato_il || '') || b.slug.localeCompare(a.slug));

  fs.mkdirSync(DIR_PAGINE, { recursive: true });
  const slugVisibili = new Set(visibili.map(e => e.slug));
  // via le pagine degli editoriali ritirati
  for (const nome of fs.readdirSync(DIR_PAGINE)) {
    const p = path.join(DIR_PAGINE, nome);
    if (fs.statSync(p).isDirectory() && !slugVisibili.has(nome)) { fs.rmSync(p, { recursive: true, force: true }); console.log(`🗑  Pagina rimossa: ${nome}`); }
  }
  visibili.forEach((e, i) => {
    const dir = path.join(DIR_PAGINE, e.slug);
    fs.mkdirSync(dir, { recursive: true });
    // più recente = indice 0: "precedente" è quello più vecchio
    fs.writeFileSync(path.join(dir, 'index.html'), paginaEditoriale(e, visibili[i + 1] || null, visibili[i - 1] || null));
  });
  fs.writeFileSync(path.join(DIR_PAGINE, 'index.html'), paginaArchivio(visibili));

  // elenco per la prima pagina (stesso contenuto a ogni esecuzione se nulla cambia)
  const ultimo = visibili.reduce((m, e) => ((e.aggiornato_il || e.data) > m ? (e.aggiornato_il || e.data) : m), '');
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'editoriali.json'), JSON.stringify({
    aggiornato: ultimo || null,
    totale: visibili.length,
    editoriali: visibili.slice(0, 20).map(e => ({ slug: e.slug, titolo: e.titolo, autore: e.autore, data: e.data, sommario: e.sommario || accorcia(e.testo, 200) })),
  }, null, 2) + '\n');

  // sitemap, robots, feed RSS
  const urls = [{ loc: SITE_URL, lastmod: ultimo || undefined }, { loc: `${SITE_URL}editoriali/`, lastmod: ultimo || undefined }]
    .concat(visibili.map(e => ({ loc: `${SITE_URL}editoriali/${e.slug}/`, lastmod: e.aggiornato_il || e.data })));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${escXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') + `\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  const rss = visibili.slice(0, 20).map(e => `    <item>
      <title>${escXml(e.titolo)}</title>
      <link>${escXml(`${SITE_URL}editoriali/${e.slug}/`)}</link>
      <guid isPermaLink="true">${escXml(`${SITE_URL}editoriali/${e.slug}/`)}</guid>
      <pubDate>${new Date(`${e.data}T08:00:00Z`).toUTCString()}</pubDate>
      <dc:creator>${escXml(e.autore)}</dc:creator>
      <description>${escXml(e.sommario || accorcia(e.testo, 300))}</description>
    </item>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'feed-editoriali.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n    <title>Editoriali di ${NOME_SITO}</title>\n    <link>${escXml(`${SITE_URL}editoriali/`)}</link>\n    <description>Gli editoriali dei giornalisti di ${NOME_SITO}</description>\n    <language>it</language>\n${visibili.length ? `    <lastBuildDate>${new Date(`${visibili[0].data}T08:00:00Z`).toUTCString()}</lastBuildDate>\n` : ''}${rss}\n  </channel>\n</rss>\n`);
  return visibili.length;
}

async function main() {
  const esistenti = caricaEsistenti();
  let esito = { nuovi: 0, aggiornati: 0, ritirati: 0, saltati: 0 };
  try {
    const csv = await leggiFonte();
    if (csv === null) console.log('Nessuna fonte configurata (EDITORIALI_CSV_URL): rigenero solo le pagine esistenti.');
    else esito = importa(righeComeOggetti(leggiCsv(csv)), esistenti);
  } catch (err) {
    // se la fonte non risponde non si tocca nulla di quello che è già pubblicato
    console.error(`⚠ Fonte non raggiungibile: ${err.message}. Resta tutto com'è.`);
  }
  const totale = scriviPagine([...esistenti.values()]);
  console.log(`Fatto. Editoriali pubblici: ${totale} (nuovi ${esito.nuovi}, aggiornati ${esito.aggiornati}, ritirati ${esito.ritirati}, saltati ${esito.saltati}).`);
}

if (require.main === module) {
  main().catch(err => { console.error('Errore fatale:', err); process.exit(1); });
}

module.exports = { leggiCsv, righeComeOggetti, dataIso, slugify, approvato };
