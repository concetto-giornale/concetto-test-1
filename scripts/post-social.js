// ============================================================
// Concetto — Pubblicazione automatica sui social
// ============================================================
// Gira su GitHub Actions dopo la generazione dell'edizione.
// Sceglie UNA sezione (a rotazione, escludendo Gossip, Italia ed Esteri)
// e la pubblica sui canali per cui esistono le chiavi (Secrets):
//   - Telegram  : TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
//   - Mastodon  : MASTODON_URL + MASTODON_TOKEN
//   - Bluesky   : BLUESKY_HANDLE + BLUESKY_APP_PASSWORD
// Se un canale non ha le chiavi viene semplicemente saltato.
// L'indirizzo del sito si imposta con la variabile SITE_URL.
// ============================================================

const fs = require('fs');
const path = require('path');

const env = n => String(process.env[n] || '').trim();

const SITE_URL = (env('SITE_URL') || 'https://concetto-giornale.github.io/concetto-test-1/').replace(/\/*$/, '/');

// Sezioni adatte alla pubblicazione automatica, a rotazione
const ROTAZIONE = ['concettoplus', 'tecnologia', 'economia', 'cultura', 'ambiente', 'sport', 'moda'];

function fraseDi(cat) {
  return cat.segments.map(s => (s && s.text) || '').join(' ')
    .replace(/\s+([.,;:!?)])/g, '$1').replace(/\s+/g, ' ').trim();
}

function giornoDellAnno(isoData) {
  const d = Date.parse(String(isoData).slice(0, 10) + 'T00:00:00Z');
  const inizio = Date.UTC(new Date(d).getUTCFullYear(), 0, 0);
  return Math.floor((d - inizio) / 86400000);
}

// Sceglie la sezione del giorno: a rotazione, saltando quelle non aggiornate
function scegliSezione(payload) {
  const idxEd = payload.edizione === 'sera' ? 1 : 0;
  const start = (giornoDellAnno(payload.data || '2026-01-01') * 2 + idxEd) % ROTAZIONE.length;
  for (let i = 0; i < ROTAZIONE.length; i++) {
    const id = ROTAZIONE[(start + i) % ROTAZIONE.length];
    const cat = payload.categorie && payload.categorie[id];
    if (cat && !cat.stale && Array.isArray(cat.segments) && cat.segments.length) {
      return { id, cat };
    }
  }
  return null;
}

function linkPost(payload, id, canale) {
  const ed = payload.id_edizione || payload.data || '';
  const q = new URLSearchParams();
  if (ed) q.set('data', ed);
  q.set('utm_source', canale);
  q.set('utm_medium', 'social');
  return `${SITE_URL}?${q.toString()}#card-${id}`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Accorcia a parola intera, con i puntini di sospensione
function tronca(testo, max) {
  const cp = [...testo];
  if (cp.length <= max) return testo;
  const taglio = cp.slice(0, Math.max(1, max - 1)).join('');
  return taglio.replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '') + '…';
}

// ---------- Telegram ----------
function testoTelegram(cat, link) {
  const fonti = (cat.fonti || [])
    .filter(f => f && /^https?:\/\//.test(f.url))
    .slice(0, 3)
    .map(f => `<a href="${esc(f.url)}">${esc(f.nome)}</a>`)
    .join(', ');
  const righe = [
    `<b>${esc((cat.label || '').toUpperCase())}</b>`,
    esc(fraseDi(cat)),
    '',
    `<i>\u201C${esc(cat.aforisma || '')}\u201D \u2014 ${esc(cat.autore || 'Anonimo')}</i>`,
    '',
  ];
  if (fonti) righe.push(`Fonti: ${fonti}`);
  righe.push(`<a href="${esc(link)}">Leggi l'edizione completa su Concetto</a>`);
  righe.push('<i>Riassunto generato dall\u2019IA</i>');
  return righe.join('\n');
}

async function inviaTelegram(cat, link) {
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env('TELEGRAM_CHAT_ID'),
      text: testoTelegram(cat, link),
      parse_mode: 'HTML',
      // l'anteprima deve essere quella di Concetto, non quella della prima fonte
      link_preview_options: { url: link, prefer_large_media: true },
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.ok) throw new Error(`Telegram: ${(j && j.description) || 'HTTP ' + res.status}`);
}

// ---------- Mastodon ----------
function testoMastodon(cat, link) {
  const coda = `\n\n\u201C${cat.aforisma || ''}\u201D \u2014 ${cat.autore || 'Anonimo'}\n\n${link}\n\nRiassunto generato dall\u2019IA`;
  // Mastodon conta ogni indirizzo come 23 caratteri; limite 500
  const spazio = 500 - [...coda.replace(link, 'x'.repeat(23))].length - 4;
  return tronca(fraseDi(cat), Math.max(80, spazio)) + coda;
}

async function inviaMastodon(cat, link) {
  const base = env('MASTODON_URL').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env('MASTODON_TOKEN')}`,
      'Idempotency-Key': `concetto-${link}`.slice(0, 200),
    },
    body: JSON.stringify({ status: testoMastodon(cat, link), visibility: 'public', language: 'it' }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Mastodon: ${(j && j.error) || 'HTTP ' + res.status}`);
}

// ---------- Bluesky ----------
function testoBluesky(cat, link) {
  const spazio = 300 - [...link].length - 2;
  return { testo: tronca(fraseDi(cat), Math.max(60, spazio)), link };
}

async function inviaBluesky(cat, link) {
  const sess = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: env('BLUESKY_HANDLE'), password: env('BLUESKY_APP_PASSWORD') }),
  });
  const sj = await sess.json().catch(() => null);
  if (!sess.ok || !sj || !sj.accessJwt) throw new Error(`Bluesky (accesso): ${(sj && sj.message) || 'HTTP ' + sess.status}`);

  const { testo, link: url } = testoBluesky(cat, link);
  const completo = `${testo}\n\n${url}`;
  const enc = new TextEncoder();
  const byteStart = enc.encode(`${testo}\n\n`).length;
  const record = {
    $type: 'app.bsky.feed.post',
    text: completo,
    createdAt: new Date().toISOString(),
    langs: ['it'],
    facets: [{
      index: { byteStart, byteEnd: byteStart + enc.encode(url).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    }],
  };
  const res = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sj.accessJwt}` },
    body: JSON.stringify({ repo: sj.did, collection: 'app.bsky.feed.post', record }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Bluesky: ${(j && j.message) || 'HTTP ' + res.status}`);
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'oggi.json'), 'utf8'));

  const canali = [];
  if (env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_CHAT_ID')) canali.push(['telegram', inviaTelegram]);
  if (env('MASTODON_URL') && env('MASTODON_TOKEN')) canali.push(['mastodon', inviaMastodon]);
  if (env('BLUESKY_HANDLE') && env('BLUESKY_APP_PASSWORD')) canali.push(['bluesky', inviaBluesky]);

  if (!canali.length) {
    console.log('Nessun canale social configurato: niente da pubblicare.');
    return;
  }

  const scelta = scegliSezione(payload);
  if (!scelta) {
    console.log('Nessuna sezione adatta alla pubblicazione in questa edizione.');
    return;
  }
  console.log(`Pubblico "${scelta.cat.label}" (edizione ${payload.id_edizione || payload.data}) su: ${canali.map(c => c[0]).join(', ')}`);

  let errori = 0;
  for (const [nome, invia] of canali) {
    try {
      await invia(scelta.cat, linkPost(payload, scelta.id, nome));
      console.log(`✓ ${nome}: pubblicato`);
    } catch (err) {
      errori++;
      console.error(`✗ ${nome}: ${err.message}`);
    }
  }
  if (errori) process.exitCode = 1;   // il run diventa rosso e GitHub ti avvisa
}

if (require.main === module) {
  main().catch(err => { console.error('Errore fatale:', err); process.exit(1); });
}

module.exports = { fraseDi, scegliSezione, linkPost, tronca, testoTelegram, testoMastodon, testoBluesky };
