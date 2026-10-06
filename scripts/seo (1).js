// ============================================================
// Concètto — SEO e GEO: parte statica delle pagine
// ============================================================
// Gira su GitHub Actions dopo la generazione delle edizioni. Per ogni pagina (italiano e
// mercati internazionali) scrive, tra i segnalibri <!--SEO-->, <!--LINGUE--> e <!--TESTO-->:
//   - robots, indirizzo canonico, hreflang tra le lingue, anteprime social e dati strutturati (JSON-LD)
//   - il selettore di lingua (solo con link statici a pagine che si possono indicizzare)
//   - la "versione testuale" dell'edizione di oggi, leggibile anche da motori di ricerca e da
//     assistenti IA che NON eseguono JavaScript
// e rigenera sitemap.xml e robots.txt.
//
// Variabili:
//   SITE_URL   indirizzo pubblico, es. https://concetto.vangard.it/
//   INDICIZZA  elenco dei mercati da far indicizzare, es. "it,fr,de" (predefinito: solo "it").
//              Le pagine degli altri mercati restano raggiungibili ma con "noindex" e fuori da sitemap.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = n => String(process.env[n] || '').trim();
const SITE_URL = (env('SITE_URL') || 'https://concetto-giornale.github.io/concetto-test-1/').replace(/\/*$/, '/');
const INDICIZZA = new Set((env('INDICIZZA') || 'it').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));

const SEZIONI = ['italia', 'esteri', 'economia', 'tecnologia', 'sport', 'cultura', 'gossip', 'ambiente', 'moda', 'concettoplus'];

const PAGINE = [
  { codice: 'it', file: 'index.html', dati: 'data/oggi.json',    hreflang: 'it',    og: 'it_IT', nome: 'Italiano',    tz: 'Europe/Rome',     locale: 'it-IT', t: { testo: 'Versione testuale dell\u2019edizione', agg: 'Ultimo aggiornamento', fonti: 'Fonti' } },
  { codice: 'fr', file: 'fr.html',    dati: 'data/fr/oggi.json', hreflang: 'fr',    og: 'fr_FR', nome: 'Français',    tz: 'Europe/Paris',    locale: 'fr-FR', t: { testo: 'Version texte de l\u2019édition', agg: 'Dernière mise à jour', fonti: 'Sources' } },
  { codice: 'de', file: 'de.html',    dati: 'data/de/oggi.json', hreflang: 'de',    og: 'de_DE', nome: 'Deutsch',     tz: 'Europe/Berlin',   locale: 'de-DE', t: { testo: 'Textversion der Ausgabe', agg: 'Zuletzt aktualisiert', fonti: 'Quellen' } },
  { codice: 'us', file: 'us.html',    dati: 'data/us/oggi.json', hreflang: 'en-US', og: 'en_US', nome: 'English (US)', tz: 'America/New_York', locale: 'en-US', t: { testo: 'Text version of today\u2019s edition', agg: 'Last updated', fonti: 'Sources' } },
  { codice: 'uk', file: 'uk.html',    dati: 'data/uk/oggi.json', hreflang: 'en-GB', og: 'en_GB', nome: 'English (UK)', tz: 'Europe/London',   locale: 'en-GB', t: { testo: 'Text version of today\u2019s edition', agg: 'Last updated', fonti: 'Sources' } },
  { codice: 'ja', file: 'ja.html',    dati: 'data/ja/oggi.json', hreflang: 'ja',    og: 'ja_JP', nome: '日本語',       tz: 'Asia/Tokyo',      locale: 'ja-JP', t: { testo: 'テキスト版', agg: '最終更新', fonti: '出典' } },
  { codice: 'ko', file: 'ko.html',    dati: 'data/ko/oggi.json', hreflang: 'ko',    og: 'ko_KR', nome: '한국어',       tz: 'Asia/Seoul',      locale: 'ko-KR', t: { testo: '텍스트 버전', agg: '마지막 업데이트', fonti: '출처' } },
];

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escXml = s => esc(s).replace(/'/g, '&apos;');
const url = p => (p.codice === 'it' ? SITE_URL : `${SITE_URL}${p.file}`);
const attiva = p => INDICIZZA.has(p.codice);

function sostituisci(html, nome, contenuto) {
  const re = new RegExp(`<!--${nome}-->[\\s\\S]*?<!--/${nome}-->`);
  if (!re.test(html)) return null;
  return html.replace(re, () => `<!--${nome}-->\n${contenuto}\n<!--/${nome}-->`);
}

function leggiDati(p) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p.dati), 'utf8')); } catch (_) { return null; }
}

const fraseDi = c => (c.segments || []).map(s => (s && s.text) || '').join(' ')
  .replace(/\s+([.,;:!?)、。])/g, '$1').replace(/\s+/g, ' ').trim();

function formatoData(p, iso) {
  try {
    return new Intl.DateTimeFormat(p.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: p.tz }).format(new Date(iso));
  } catch (_) { return ''; }
}

function bloccoSeo(p, html, dati) {
  const titolo = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Concètto').trim();
  const descrizione = ((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').trim();
  const attive = PAGINE.filter(attiva);
  const indicizzabile = attiva(p);
  const canonico = url(p);
  const righe = [];
  righe.push(`<meta name="robots" content="${indicizzabile ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">`);
  righe.push(`<link rel="canonical" href="${esc(canonico)}">`);
  if (indicizzabile && attive.length > 1) {
    attive.forEach(a => righe.push(`<link rel="alternate" hreflang="${a.hreflang}" href="${esc(url(a))}">`));
    righe.push(`<link rel="alternate" hreflang="x-default" href="${esc(url(attive.find(a => a.codice === 'it') || attive[0]))}">`);
  }
  righe.push(`<meta property="og:type" content="website">`);
  righe.push(`<meta property="og:site_name" content="Concètto">`);
  righe.push(`<meta property="og:locale" content="${p.og}">`);
  righe.push(`<meta property="og:title" content="${esc(titolo)}">`);
  righe.push(`<meta property="og:description" content="${esc(descrizione)}">`);
  righe.push(`<meta property="og:url" content="${esc(canonico)}">`);
  righe.push(`<meta property="og:image" content="${SITE_URL}concetto-og.png">`);
  righe.push(`<meta name="twitter:card" content="summary_large_image">`);
  righe.push(`<meta name="twitter:title" content="${esc(titolo)}">`);
  righe.push(`<meta name="twitter:description" content="${esc(descrizione)}">`);
  righe.push(`<meta name="twitter:image" content="${SITE_URL}concetto-og.png">`);

  const elementi = [];
  if (dati && dati.categorie) {
    SEZIONI.forEach(id => {
      const c = dati.categorie[id];
      if (c && Array.isArray(c.segments) && c.segments.length) elementi.push({ '@type': 'ListItem', position: elementi.length + 1, name: `${c.label}: ${fraseDi(c)}` });
    });
  }
  const grafo = [
    { '@type': 'Organization', '@id': `${SITE_URL}#org`, name: 'Concètto', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}apple-touch-icon.png` }, parentOrganization: { '@type': 'Organization', name: 'Vangard', url: 'https://www.vangard.it' } },
    { '@type': 'WebSite', '@id': `${SITE_URL}#sito`, url: SITE_URL, name: 'Concètto', publisher: { '@id': `${SITE_URL}#org` } },
    Object.assign({ '@type': 'CollectionPage', '@id': `${canonico}#pagina`, url: canonico, name: titolo, description: descrizione, inLanguage: p.hreflang, isPartOf: { '@id': `${SITE_URL}#sito` } },
      dati && dati.generato_il ? { dateModified: dati.generato_il } : {},
      elementi.length ? { mainEntity: { '@type': 'ItemList', itemListElement: elementi } } : {}),
  ];
  righe.push(`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': grafo }).replace(/</g, '\\u003c')}</script>`);
  return righe.join('\n');
}

function bloccoLingue(p) {
  const attive = PAGINE.filter(attiva);
  if (attive.length < 2) return '';
  const voci = attive.map(a => a.codice === p.codice
    ? `<span class="lingua-attuale" lang="${a.hreflang}">${esc(a.nome)}</span>`
    : `<a href="${a.codice === 'it' ? './' : a.file}" hreflang="${a.hreflang}" lang="${a.hreflang}">${esc(a.nome)}</a>`).join(' · ');
  return `<nav class="lingue" aria-label="Languages">${voci}</nav>`;
}

function bloccoTesto(p, dati) {
  if (!dati || !dati.categorie) return '';
  const parti = [];
  SEZIONI.forEach(id => {
    const c = dati.categorie[id];
    if (!c || !Array.isArray(c.segments) || !c.segments.length) return;
    const fonti = (c.fonti || []).filter(f => f && /^https?:\/\//.test(f.url))
      .map(f => `<a href="${esc(f.url)}" rel="noopener nofollow" target="_blank">${esc(f.nome)}</a>`).join(', ');
    parti.push(`<article>
<h3>${esc(c.label)}</h3>
<p>${esc(fraseDi(c))}</p>${c.aforisma ? `\n<blockquote>\u201C${esc(c.aforisma)}\u201D${c.autore ? ` \u2014 ${esc(c.autore)}` : ''}</blockquote>` : ''}${fonti ? `\n<p class="fonti-testo">${esc(p.t.fonti)}: ${fonti}</p>` : ''}
</article>`);
  });
  if (!parti.length) return '';
  const quando = dati.generato_il ? `<p><time datetime="${esc(dati.generato_il)}">${esc(p.t.agg)}: ${esc(formatoData(p, dati.generato_il))}</time></p>` : '';
  return `<section class="testo-edizione" lang="${p.hreflang}"><details><summary>${esc(p.t.testo)}</summary>\n${quando}\n${parti.join('\n')}\n</details></section>`;
}

function main() {
  const abilitate = PAGINE.filter(attiva).map(p => p.codice).join(', ') || '(nessuna)';
  console.log(`SITE_URL: ${SITE_URL}\nMercati indicizzabili: ${abilitate}`);
  const lastmod = {};
  for (const p of PAGINE) {
    const file = path.join(ROOT, p.file);
    if (!fs.existsSync(file)) { console.log(`- ${p.codice}: ${p.file} non c'è, salto`); continue; }
    let html = fs.readFileSync(file, 'utf8');
    const dati = leggiDati(p);
    if (dati && dati.generato_il) lastmod[p.codice] = String(dati.generato_il).slice(0, 10);
    let n = 0;
    for (const [nome, contenuto] of [['SEO', bloccoSeo(p, html, dati)], ['LINGUE', bloccoLingue(p)], ['TESTO', bloccoTesto(p, dati)]]) {
      const nuovo = sostituisci(html, nome, contenuto);
      if (nuovo === null) { console.warn(`  ⚠ ${p.file}: manca il segnalibro <!--${nome}-->`); continue; }
      html = nuovo; n++;
    }
    fs.writeFileSync(file, html);
    console.log(`✓ ${p.file}: ${n}/3 blocchi aggiornati${dati ? '' : ' (nessun dato ancora)'}${attiva(p) ? ' [indicizzabile]' : ' [noindex]'}`);
  }

  // sitemap e robots: solo i mercati indicizzabili
  const attive = PAGINE.filter(p => attiva(p) && fs.existsSync(path.join(ROOT, p.file)));
  const xhtml = attive.length > 1
    ? attive.map(a => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escXml(url(a))}"/>`).join('\n') + '\n'
    : '';
  const voci = attive.map(p => `  <url>
    <loc>${escXml(url(p))}</loc>${lastmod[p.codice] ? `\n    <lastmod>${lastmod[p.codice]}</lastmod>` : ''}
${xhtml}  </url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${voci}\n</urlset>\n`);
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  console.log(`sitemap.xml: ${attive.length} pagine; robots.txt aggiornato.`);
}

main();
