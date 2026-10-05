// ============================================================
// Concètto — Generatore delle edizioni internazionali
// ============================================================
// Un solo script per tutti i mercati: fr (Francia), de (Germania), us (Stati Uniti),
// uk (Regno Unito), ja (Giappone), ko (Corea). Ogni mercato ha le sue fonti
// (Google News del paese, con Bing News come piano B), le sue sezioni nella lingua
// locale, le sue frasi e la sua cartella dati: data/<mercato>/.
//
// Uso:
//   node scripts/generate-mercato.js              -> solo i mercati "in scadenza" (dopo le 8 e dopo le 18, ora locale)
//   node scripts/generate-mercato.js tutti        -> tutti i mercati attivi, adesso
//   node scripts/generate-mercato.js fr,ja        -> solo quelli indicati, adesso
// Variabili: ZAI_API_KEY, PEXELS_API_KEY (facoltativa), MERCATI_ATTIVI (es. "fr,de,us,uk,ja"),
//            SVUOTA_ARCHIVIO ("true" per cancellare l'archivio dei mercati generati).
// ============================================================

const fs = require('fs');
const path = require('path');

const ZAI_KEY = process.env.ZAI_API_KEY;
if (!ZAI_KEY) {
  console.error('Manca la variabile d\'ambiente ZAI_API_KEY (va impostata come Secret su GitHub).');
  process.exit(1);
}

// ---------- Edizioni di Google News / Bing per paese ----------
const ED = {
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en', bing: 'en-US' },
  UK: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en', bing: 'en-GB' },
  DE: { hl: 'de',    gl: 'DE', ceid: 'DE:de', bing: 'de-DE' },
  FR: { hl: 'fr',    gl: 'FR', ceid: 'FR:fr', bing: 'fr-FR' },
  IT: { hl: 'it',    gl: 'IT', ceid: 'IT:it', bing: 'it-IT' },
  JP: { hl: 'ja',    gl: 'JP', ceid: 'JP:ja', bing: 'ja-JP' },
  KR: { hl: 'ko',    gl: 'KR', ceid: 'KR:ko', bing: 'ko-KR' },
};

const NOMI_PAESI = {
  fr: { US: 'États-Unis', UK: 'Royaume-Uni', DE: 'Allemagne', FR: 'France', IT: 'Italie', JP: 'Japon' },
  de: { US: 'USA', UK: 'Vereinigtes Königreich', DE: 'Deutschland', FR: 'Frankreich', IT: 'Italien', JP: 'Japan' },
  en: { US: 'United States', UK: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy', JP: 'Japan' },
  ja: { US: 'アメリカ', UK: 'イギリス', DE: 'ドイツ', FR: 'フランス', IT: 'イタリア', JP: '日本' },
  ko: { US: '미국', UK: '영국', DE: '독일', FR: '프랑스', IT: '이탈리아', JP: '일본' },
};

// Le sezioni hanno gli stessi identificativi interni in tutti i mercati (italia = "il paese", esteri = "il mondo"...)
const MERCATI = {
  fr: {
    nome: 'Francia', edizione: 'FR', lang: 'fr', tz: 'Europe/Paris', casa: 'la France', maxCharTag: 48,
    etichette: { italia: 'France', esteri: 'Monde', economia: 'Économie', tecnologia: 'Technologie', sport: 'Sport', cultura: 'Culture & Spectacles', gossip: 'People', ambiente: 'Environnement', moda: 'Mode & Lifestyle', concettoplus: 'Concètto+' },
    query: { gossip: 'people célébrités actualité', ambiente: 'environnement climat développement durable', moda: 'mode lifestyle design' },
    bingQuery: { italia: 'actualité France politique société', esteri: 'actualité internationale monde', economia: 'économie finance marchés', tecnologia: 'technologie innovation intelligence artificielle', sport: 'sport', cultura: 'culture spectacles cinéma musique' },
    plus: [['US', 'France'], ['UK', 'France'], ['DE', 'Frankreich'], ['IT', 'Francia'], ['JP', 'フランス']],
  },
  de: {
    nome: 'Germania', edizione: 'DE', lang: 'de', tz: 'Europe/Berlin', casa: 'Deutschland', maxCharTag: 60,
    etichette: { italia: 'Deutschland', esteri: 'Welt', economia: 'Wirtschaft', tecnologia: 'Technik', sport: 'Sport', cultura: 'Kultur & Unterhaltung', gossip: 'Prominente', ambiente: 'Umwelt', moda: 'Mode & Lifestyle', concettoplus: 'Concètto+' },
    query: { gossip: 'Prominente Klatsch Stars', ambiente: 'Umwelt Klima Nachhaltigkeit', moda: 'Mode Lifestyle Design' },
    bingQuery: { italia: 'Nachrichten Deutschland Politik', esteri: 'Nachrichten Welt international', economia: 'Wirtschaft Finanzen Börse', tecnologia: 'Technik Digitales Künstliche Intelligenz', sport: 'Sport', cultura: 'Kultur Unterhaltung Film Musik' },
    plus: [['US', 'Germany'], ['UK', 'Germany'], ['FR', 'Allemagne'], ['IT', 'Germania'], ['JP', 'ドイツ']],
  },
  us: {
    nome: 'Stati Uniti', edizione: 'US', lang: 'en', tz: 'America/New_York', casa: 'the United States', maxCharTag: 48,
    etichette: { italia: 'U.S.', esteri: 'World', economia: 'Business', tecnologia: 'Technology', sport: 'Sports', cultura: 'Culture & Entertainment', gossip: 'Celebrity', ambiente: 'Environment', moda: 'Fashion & Lifestyle', concettoplus: 'Concètto+' },
    query: { gossip: 'celebrity news entertainment gossip', ambiente: 'environment climate sustainability', moda: 'fashion lifestyle design' },
    bingQuery: { italia: 'US news politics society', esteri: 'world news international', economia: 'business economy markets', tecnologia: 'technology innovation artificial intelligence', sport: 'sports', cultura: 'culture entertainment movies music' },
    plus: [['UK', 'United States'], ['DE', 'USA'], ['FR', 'États-Unis'], ['IT', 'Stati Uniti'], ['JP', 'アメリカ']],
  },
  uk: {
    nome: 'Regno Unito', edizione: 'UK', lang: 'en', tz: 'Europe/London', casa: 'the United Kingdom', maxCharTag: 48,
    etichette: { italia: 'UK', esteri: 'World', economia: 'Business', tecnologia: 'Technology', sport: 'Sport', cultura: 'Culture & Entertainment', gossip: 'Celebrity', ambiente: 'Environment', moda: 'Fashion & Lifestyle', concettoplus: 'Concètto+' },
    query: { gossip: 'celebrity news showbiz gossip', ambiente: 'environment climate sustainability', moda: 'fashion lifestyle design' },
    bingQuery: { italia: 'UK news politics society', esteri: 'world news international', economia: 'business economy markets', tecnologia: 'technology innovation artificial intelligence', sport: 'sport', cultura: 'culture entertainment film music' },
    plus: [['US', 'United Kingdom'], ['DE', 'Großbritannien'], ['FR', 'Royaume-Uni'], ['IT', 'Regno Unito'], ['JP', 'イギリス']],
  },
  ja: {
    nome: 'Giappone', edizione: 'JP', lang: 'ja', tz: 'Asia/Tokyo', casa: '日本', maxCharTag: 12,
    etichette: { italia: '国内', esteri: '国際', economia: '経済', tecnologia: 'テクノロジー', sport: 'スポーツ', cultura: '文化・芸能', gossip: 'ゴシップ', ambiente: '環境', moda: 'ファッション・ライフ', concettoplus: 'Concètto+' },
    query: { gossip: '芸能 ゴシップ 話題', ambiente: '環境 気候 サステナビリティ', moda: 'ファッション ライフスタイル デザイン' },
    bingQuery: { italia: '国内ニュース 政治 社会', esteri: '国際ニュース 世界', economia: '経済 株価 金融', tecnologia: 'テクノロジー AI 技術', sport: 'スポーツ', cultura: '文化 芸能 映画 音楽' },
    plus: [['US', 'Japan'], ['UK', 'Japan'], ['DE', 'Japan'], ['FR', 'Japon'], ['IT', 'Giappone']],
  },
  ko: {
    nome: 'Corea', edizione: 'KR', lang: 'ko', tz: 'Asia/Seoul', casa: '한국', maxCharTag: 18,
    etichette: { italia: '국내', esteri: '세계', economia: '경제', tecnologia: '기술', sport: '스포츠', cultura: '문화·연예', gossip: '가십', ambiente: '환경', moda: '패션·라이프', concettoplus: 'Concètto+' },
    query: { gossip: '연예 화제 스타 근황', ambiente: '환경 기후 지속가능', moda: '패션 라이프스타일 디자인' },
    bingQuery: { italia: '국내 뉴스 정치 사회', esteri: '세계 뉴스 국제', economia: '경제 증시 금융', tecnologia: '기술 IT 인공지능', sport: '스포츠', cultura: '문화 연예 영화 음악' },
    plus: [['US', 'South Korea'], ['UK', 'South Korea'], ['JP', '韓国'], ['DE', 'Südkorea'], ['IT', 'Corea del Sud']],
  },
};

let M = null;
let CATEGORIES = [];
let PLUS_FEEDS = [];
let BING_QUERY = {};
const ANSA_FEED = {};   // nessun feed di agenzia: il piano B è Bing News
let MAX_CARATTERI_EVIDENZIATI = 48;

function usaMercato(codice) {
  M = MERCATI[codice];
  if (!M) throw new Error(`Mercato sconosciuto: ${codice}`);
  M.codice = codice;
  const E = M.etichette;
  CATEGORIES = [
    { id: 'italia',       label: E.italia,       kind: 'topic',  topic: 'NATION' },
    { id: 'esteri',       label: E.esteri,       kind: 'topic',  topic: 'WORLD' },
    { id: 'economia',     label: E.economia,     kind: 'topic',  topic: 'BUSINESS' },
    { id: 'tecnologia',   label: E.tecnologia,   kind: 'topic',  topic: 'TECHNOLOGY' },
    { id: 'sport',        label: E.sport,        kind: 'topic',  topic: 'SPORTS' },
    { id: 'cultura',      label: E.cultura,      kind: 'topic',  topic: 'ENTERTAINMENT' },
    { id: 'gossip',       label: E.gossip,       kind: 'search', query: M.query.gossip },
    { id: 'ambiente',     label: E.ambiente,     kind: 'search', query: M.query.ambiente },
    { id: 'moda',         label: E.moda,         kind: 'search', query: M.query.moda },
    { id: 'concettoplus', label: E.concettoplus, kind: 'plus' },
  ];
  const nomi = NOMI_PAESI[M.lang];
  PLUS_FEEDS = M.plus.map(([k, q]) => ({ paese: nomi[k], q, ...ED[k] }));
  BING_QUERY = M.bingQuery;
  MAX_CARATTERI_EVIDENZIATI = M.maxCharTag;
}

function googleNewsUrl(cat) {
  const e = ED[M.edizione];
  if (cat.kind === 'topic') {
    return `https://news.google.com/rss/headlines/section/topic/${cat.topic}?hl=${e.hl}&gl=${e.gl}&ceid=${e.ceid}`;
  }
  if (cat.kind === 'search') {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query)}&hl=${e.hl}&gl=${e.gl}&ceid=${e.ceid}`;
  }
  return null;
}

function plusUrl(f) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(f.q)}&hl=${f.hl}&gl=${f.gl}&ceid=${f.ceid}`;
}

function bingUrl(q, mercato) {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setmkt=${mercato}`;
}

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

// Restituisce [{ title, link, nome, sourceUrl }] per ogni articolo del feed.
// Funziona con Google News, con i feed delle agenzie (ANSA) e con Bing News.
function extractItems(xmlText, count, nomeDefault) {
  const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items
    .slice(0, count)
    .map(item => {
      const t = item.match(/<title>([\s\S]*?)<\/title>/);
      if (!t) return null;
      const l = item.match(/<link>([\s\S]*?)<\/link>/);
      const s = item.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
      const bingSource = item.match(/<News:Source>([\s\S]*?)<\/News:Source>/i);
      let title = decodeEntities(t[1]).trim();
      const nome = s ? decodeEntities(s[2]).trim() : bingSource ? decodeEntities(bingSource[1]).trim() : (nomeDefault || '');
      // Google News aggiunge " - Testata" in fondo al titolo: lo togliamo
      if (nome && title.endsWith(' - ' + nome)) title = title.slice(0, -(nome.length + 3)).trim();
      let link = l ? decodeEntities(l[1]).trim() : '';
      // Bing passa da un reindirizzamento: il vero indirizzo dell'articolo è nel parametro "url"
      if (/bing\.com\/news\/apiclick/i.test(link)) {
        try { link = new URL(link).searchParams.get('url') || link; } catch (_) { /* resta com'è */ }
      }
      return { title, link, nome, sourceUrl: s ? decodeEntities(s[1]).trim() : '' };
    })
    .filter(Boolean);
}

const AGENTI_UTENTE = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; ConcettoBot/1.0; +https://concetto.vangard.it)',
];

// Scarica un feed con 3 tentativi; se non arrivano articoli scrive nel log il PERCHÉ (codice, tipo, inizio della risposta)
async function scaricaFeed(url, etichetta) {
  const pause = [4000, 12000, 0];
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': AGENTI_UTENTE[t % AGENTI_UTENTE.length],
          'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.6',
        },
        redirect: 'follow',
      });
      const testo = await res.text();
      const n = (testo.match(/<item>/g) || []).length;
      if (res.ok && n > 0) return testo;
      console.warn(`  ⚠ ${etichetta}: HTTP ${res.status}, ${n} articoli, tipo "${res.headers.get('content-type') || '?'}", inizio: ${testo.slice(0, 140).replace(/\s+/g, ' ')}`);
    } catch (err) {
      console.warn(`  ⚠ ${etichetta}: ${err.message}`);
    }
    if (pause[t]) await sleep(pause[t]);
  }
  return null;
}

async function fetchItems(url, count, paese, etichetta, nomeDefault) {
  const xml = await scaricaFeed(url, etichetta || url.slice(0, 60));
  if (!xml) return [];
  const items = extractItems(xml, count, nomeDefault);
  if (paese) items.forEach(i => { i.paese = paese; });
  return items;
}


// ---------- Istruzioni al modello, nella lingua del mercato ----------
const PROMPT = {
  fr: (lista, isPlus, label) => `Tu es un système éditorial qui condense de vraies actualités en une seule phrase en français.

${isPlus ? `Voici une liste de titres réels de médias étrangers de plusieurs pays (le pays est indiqué entre crochets) qui parlent de ${M.casa} :` : `Voici une liste de titres d'actualité réels, collectés à l'instant dans la catégorie « ${label} » :`}
${lista}

1. À partir de ces titres, repère le thème principal (inutile de tous les utiliser s'ils se répètent).
2. Écris UNE seule phrase en français, fluide et naturelle (28 à 40 mots), qui condense le sens des titres : pas une liste, une phrase éditoriale unique, au ton neutre et factuel.
3. Découpe cette phrase en segments ordonnés qui, mis bout à bout dans l'ordre donné, reconstituent exactement la phrase complète, avec son espacement et sa ponctuation naturels. Chaque segment est un objet avec :
   - "text" : le texte du segment
   - "type" : l'un de "plain", "unusual", "date", "name", "deepdive"
     - "unusual" : un mot ou une expression peu courante, technique ou recherchée
     - "date" : une date ou une référence temporelle
     - "name" : le nom propre d'une personne, d'une organisation, d'un lieu ou d'une institution
     - "deepdive" : un concept dense, qui mériterait un approfondissement à part
   - pour chaque type autre que "plain", ajoute aussi "detail" : une phrase courte (20 mots maximum) qui explique ou contextualise précisément ce segment
   RÈGLE IMPORTANTE : chaque segment autre que "plain" doit comporter UN, DEUX ou TROIS mots au maximum (jamais une proposition entière). Mets en évidence de 3 à 6 segments en tout ; le reste de la phrase est en segments "plain", qui peuvent être longs.
4. Écris aussi un "aforisma" : une courte phrase de réflexion (16 mots maximum) qui résonne avec le thème de fond, sans le paraphraser.
5. Invente aussi un "autore" pour cet aphorisme : un prénom et un nom de fantaisie, clairement inventés. N'utilise JAMAIS le nom d'une personne réelle ou publique.
6. Écris aussi un "approfondimento" : deux phrases (40 mots maximum au total) qui développent le thème "deepdive".
7. Indique dans "fonti" les numéros (4 au maximum) des titres de la liste que tu as réellement utilisés pour écrire la phrase.
8. Indique dans "foto" UN ou DEUX mots EN ANGLAIS, concrets et génériques, pour chercher une photographie illustrant le thème de fond (par exemple "parliament", "storm clouds", "football stadium"). Jamais de noms de personnes, d'équipes ou de marques.

Réponds UNIQUEMENT par un objet JSON valide, sans markdown, sans backticks, sans texte avant ou après, exactement sous cette forme :
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"...","fonti":[1,4],"foto":"..."}

Vérifie que la concaténation de tous les "text" dans l'ordre reconstitue exactement la phrase.`,

  de: (lista, isPlus, label) => `Du bist ein redaktionelles System, das echte Nachrichten in einem einzigen deutschen Satz zusammenfasst.

${isPlus ? `Hier ist eine Liste echter Schlagzeilen ausländischer Medien aus mehreren Ländern (das Land steht in eckigen Klammern), die über ${M.casa} berichten:` : `Hier ist eine Liste echter Nachrichten-Schlagzeilen, soeben zur Kategorie „${label}“ gesammelt:`}
${lista}

1. Erkenne in diesen Schlagzeilen das Hauptthema (du musst nicht alle verwenden, wenn sie sich wiederholen).
2. Schreibe EINEN einzigen, flüssigen und natürlichen deutschen Satz (25 bis 36 Wörter), der den Sinn der Schlagzeilen verdichtet: keine Aufzählung, sondern ein einziger redaktioneller Satz in sachlichem, neutralem Ton.
3. Zerlege diesen Satz in geordnete Segmente, die in der angegebenen Reihenfolge aneinandergefügt genau den vollständigen Satz mit seinen natürlichen Abständen und seiner Zeichensetzung ergeben. Jedes Segment ist ein Objekt mit:
   - "text": der Text des Segments
   - "type": einer von "plain", "unusual", "date", "name", "deepdive"
     - "unusual": ein ungewöhnliches, fachsprachliches oder gehobenes Wort bzw. Ausdruck
     - "date": ein Datum oder ein zeitlicher Bezug
     - "name": der Eigenname einer Person, Organisation, eines Ortes oder einer Institution
     - "deepdive": ein dichtes Konzept, das eine eigene Vertiefung verdient
   - für jeden Typ außer "plain" füge außerdem "detail" hinzu: ein kurzer Satz (höchstens 18 Wörter), der genau dieses Segment erklärt oder einordnet
   WICHTIGE REGEL: Jedes Segment außer "plain" besteht aus EINEM, ZWEI oder höchstens DREI Wörtern (niemals aus einem ganzen Satzteil). Hebe insgesamt 3 bis 6 Segmente hervor; der Rest des Satzes steht in "plain"-Segmenten, die lang sein dürfen.
4. Schreibe außerdem einen "aforisma": einen kurzen nachdenklichen Satz (höchstens 14 Wörter), der zum Grundthema passt, ohne es zu umschreiben.
5. Erfinde außerdem einen "autore" für den Aphorismus: einen frei erfundenen Vor- und Nachnamen. Verwende NIEMALS den Namen einer realen oder öffentlichen Person.
6. Schreibe außerdem einen "approfondimento": zwei Sätze (insgesamt höchstens 36 Wörter), die das "deepdive"-Thema vertiefen.
7. Nenne in "fonti" die Nummern (höchstens 4) der Schlagzeilen aus der Liste, die du tatsächlich für den Satz verwendet hast.
8. Nenne in "foto" EIN oder ZWEI Wörter AUF ENGLISCH, konkret und allgemein, um ein Foto zu suchen, das das Grundthema illustriert (zum Beispiel "parliament", "storm clouds", "football stadium"). Niemals Namen von Personen, Teams oder Marken.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt, ohne Markdown, ohne Backticks, ohne Text davor oder danach, genau in dieser Form:
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"...","fonti":[1,4],"foto":"..."}

Stelle sicher, dass die Verkettung aller "text"-Werte in der Reihenfolge genau den Satz ergibt.`,

  en: (lista, isPlus, label) => `You are an editorial system that condenses real news into a single English sentence.

${isPlus ? `Here is a list of real headlines from foreign media in several countries (the country is in square brackets) that talk about ${M.casa}:` : `Here is a list of real news headlines, just collected for the category "${label}":`}
${lista}

1. From these headlines, identify the main theme (you don't have to use them all if they are redundant).
2. Write ONE single, fluent and natural sentence in English (28 to 40 words) that condenses what the headlines say: not a list, one editorial sentence, in a neutral and factual tone.
3. Split that sentence into ordered segments that, joined exactly in the order given, rebuild the complete sentence with its natural spacing and punctuation. Each segment is an object with:
   - "text": the text of the segment
   - "type": one of "plain", "unusual", "date", "name", "deepdive"
     - "unusual": an uncommon, technical or refined word or expression
     - "date": a date or a time reference
     - "name": the proper name of a person, organization, place or institution
     - "deepdive": a dense concept that would deserve a separate explanation
   - for every type other than "plain", also add "detail": a short sentence (maximum 20 words) that explains or gives context to that specific segment
   IMPORTANT RULE: every segment other than "plain" must be ONE, TWO or at most THREE words (never a whole clause). Highlight 3 to 6 segments in total; the rest of the sentence is made of "plain" segments, which may be long.
4. Also write an "aforisma": a short reflective sentence (maximum 16 words) that resonates with the underlying theme, without paraphrasing it.
5. Also invent an "autore" for the aphorism: a clearly fictional first and last name. NEVER use the name of a real or public person.
6. Also write an "approfondimento": two sentences (maximum 40 words in total) that develop the "deepdive" theme.
7. In "fonti", list the numbers (at most 4) of the headlines in the list that you actually used to write the sentence.
8. In "foto", give ONE or TWO words, concrete and generic, to search for a photograph illustrating the underlying theme (for example "parliament", "storm clouds", "football stadium"). Never names of people, teams or brands.

Reply ONLY with a valid JSON object, no markdown, no backticks, no text before or after, in exactly this form:
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"...","fonti":[1,4],"foto":"..."}

Make sure that joining all the "text" values in order rebuilds the sentence exactly.`,

  ja: (lista, isPlus, label) => `あなたは、実際のニュースを日本語の一文にまとめる編集システムです。

${isPlus ? `以下は、${M.casa}について報じている複数の国の海外メディアの実際の見出しです(角かっこ内は国名):` : `以下は、「${label}」カテゴリで今収集した実際のニュース見出しです:`}
${lista}

1. 見出しから中心となるテーマを見つけてください(重複している見出しは全部使う必要はありません)。
2. 見出しの内容を凝縮した、自然でなめらかな日本語の一文を「ひとつだけ」書いてください(70〜110文字)。見出しの羅列ではなく、客観的で中立的な、ひとつの編集文にしてください。
3. その文をセグメントに分けてください。順番どおりにつなげると元の文が正確に復元できなければなりません。各セグメントは次の項目を持つオブジェクトです:
   - "text": セグメントのテキスト
   - "type": "plain"、"unusual"、"date"、"name"、"deepdive" のいずれか
     - "unusual": あまり一般的でない言葉・専門的な言葉・表現
     - "date": 日付や時期を表す表現
     - "name": 人物・組織・場所・機関の固有名詞
     - "deepdive": 別途くわしく説明する価値のある重要な概念
   - "plain" 以外には "detail" も加えてください: そのセグメントを具体的に説明する短い文(40文字以内)
   重要なルール:
   (a) セグメントは、できるだけ文節(助詞や語尾を前の語につけたまとまり)の区切りで分けてください。
   (b) "plain" 以外のセグメントは12文字以内の短い語句にしてください(文や節全体は禁止)。文全体で3〜6個を強調してください。"plain" のセグメントは長くても構いません。
4. "aforisma": テーマと響き合う短い省察の一文(40文字以内)。見出しの言い換えは避けてください。
5. "autore": このアフォリズムの筆者として、完全に架空の日本人の姓名を作ってください。実在の人物の名前は絶対に使わないでください。
6. "approfondimento": "deepdive" のテーマを掘り下げる二文(合計100文字以内)。
7. "fonti": 文を書くのに実際に使った見出しの番号(最大4つ)。
8. "foto": テーマを表す写真を探すための英語の単語1〜2語(具体的で一般的な語。例: "parliament", "storm clouds", "football stadium")。人名・チーム名・ブランド名は禁止です。

有効なJSONオブジェクトのみで答えてください。マークダウン、バッククォート、前後の説明は不要です。形式は次のとおりです:
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"...","fonti":[1,4],"foto":"..."}

すべての "text" を順番につなげると文がそのまま復元されることを確認してください。`,

  ko: (lista, isPlus, label) => `당신은 실제 뉴스를 한국어 한 문장으로 요약하는 편집 시스템입니다.

${isPlus ? `아래는 ${M.casa}을 다룬 외국 언론의 실제 헤드라인 목록입니다(대괄호 안은 국가):` : `아래는 "${label}" 분야에서 지금 수집한 실제 뉴스 헤드라인 목록입니다:`}
${lista}

1. 헤드라인에서 핵심 주제를 파악하세요(겹치는 헤드라인은 모두 쓸 필요가 없습니다).
2. 자연스럽고 매끄러운 한국어 문장 "하나"를 쓰세요(띄어쓰기로 구분한 어절 기준 18~28어절). 헤드라인을 나열하지 말고 하나의 편집 문장으로 압축하세요. 객관적이고 중립적인 어조를 쓰세요.
3. 이 문장을 세그먼트로 나누세요. 순서대로 이어 붙이면 원래 문장이 되어야 합니다. 각 세그먼트는 다음 항목을 가진 객체입니다:
   - "text": 세그먼트의 텍스트
   - "type": "plain", "unusual", "date", "name", "deepdive" 중 하나
     - "unusual": 흔치 않거나 전문적인 낱말·표현
     - "date": 날짜나 시점 표현
     - "name": 인물·기관·장소의 고유명사
     - "deepdive": 따로 더 설명할 만한 핵심 개념
   - "plain"이 아니면 "detail"도 추가하세요: 그 세그먼트를 구체적으로 설명하는 짧은 문장(15어절 이내)
   중요한 규칙:
   (a) 세그먼트는 반드시 띄어쓰기(어절) 경계에서만 나누세요. 조사와 어미는 앞 어절에 붙여 같은 세그먼트에 두세요(예: "삼성전자는").
   (b) "plain"이 아닌 세그먼트는 1~3어절만 허용됩니다(절대 문장 전체가 아니어야 합니다). 문장 전체에서 3~6개를 강조하세요. "plain" 세그먼트는 길어도 됩니다.
4. "aforisma": 주제와 의미가 통하는 짧은 성찰 문장(14어절 이내). 헤드라인을 그대로 바꿔 쓰지 마세요.
5. "autore": 아포리즘 필자로 완전히 가상의 한국식 이름(성+이름)을 지어내세요. 실존 인물의 이름은 절대 쓰지 마세요.
6. "approfondimento": "deepdive" 주제를 더 깊이 설명하는 두 문장(전체 30어절 이내).
7. "fonti": 문장을 쓸 때 실제로 사용한 헤드라인 번호(최대 4개).
8. "foto": 주제를 보여 줄 사진을 찾기 위한 영어 단어 1~2개(구체적이고 일반적인 단어, 예: "parliament", "storm clouds", "football stadium"). 인명, 팀 이름, 브랜드 이름은 금지입니다.

반드시 유효한 JSON 객체만 답하세요. 마크다운, 백틱, 앞뒤 설명은 쓰지 마세요. 정확히 다음 형식입니다:
{"segments":[{"text":"...","type":"plain"},{"text":"...","type":"name","detail":"..."}],"aforisma":"...","autore":"...","approfondimento":"...","fonti":[1,4],"foto":"..."}

모든 "text"를 순서대로 이어 붙이면 문장이 그대로 복원되도록 하세요.`,
};

function buildPrompt(items, isPlus, categoryLabel) {
  const lista = items.map((h, i) => `${i + 1}. ${isPlus ? `[${h.paese}] ` : ''}${h.title}`).join('\n');
  return PROMPT[M.lang](lista, isPlus, categoryLabel);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Edizione di mattina o di sera (ora locale del mercato) ----------
const ARCHIVIO_GIORNI = 7;   // l'archivio tiene solo le edizioni degli ultimi 7 giorni

function dataLocale(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: M.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function oraLocale(d) {
  return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: M.tz, hour: '2-digit', hour12: false }).format(d), 10) % 24;
}
function edizioneCorrente(d) {
  const forzata = (process.env.EDIZIONE || '').toLowerCase();
  if (forzata === 'mattina' || forzata === 'sera') return forzata;
  return oraLocale(d) < 14 ? 'mattina' : 'sera';
}

const PAUSA_TRA_CATEGORIE_MS = 8000;
// Attese prima di ogni nuovo tentativo su 429 / errori di rete / 5xx
const BACKOFF_MS = [15000, 30000, 60000, 90000];

async function callZaiOnce(promptText) {
  const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZAI_KEY}`
    },
    body: JSON.stringify({
      model: 'glm-4.7-flash',
      messages: [{ role: 'user', content: promptText }],
      // GLM-4.7-Flash ragiona di default: qui non serve, e rallenta/appesantisce ogni richiesta
      thinking: { type: 'disabled' },
      max_tokens: 2000
    })
  });

  let data = null;
  try { data = await response.json(); } catch (_) { /* corpo non JSON */ }

  if (!response.ok || (data && data.error)) {
    const msg = (data && data.error && data.error.message) || 'Errore Z.ai';
    const err = new Error(`[HTTP ${response.status}] ${msg}`);
    err.status = response.status;
    err.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || 0;
    throw err;
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Risposta vuota da Z.ai.');
  return content.trim();
}

async function callZai(promptText) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callZaiOnce(promptText);
    } catch (err) {
      const retryable = err.status === 429 || err.status >= 500 || err.status === undefined;
      if (!retryable || attempt >= BACKOFF_MS.length) throw err;
      const wait = Math.max(BACKOFF_MS[attempt], err.retryAfterMs || 0);
      console.warn(`  ⚠ ${err.message} — riprovo tra ${Math.round(wait / 1000)}s (tentativo ${attempt + 2}/${BACKOFF_MS.length + 1})`);
      await sleep(wait);
    }
  }
}

const TIPI_VALIDI = ['plain', 'unusual', 'date', 'name', 'deepdive'];
const MAX_PAROLE_EVIDENZIATE = 3;

function parseModelJson(rawText) {
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.segments || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    throw new Error('Risposta senza segmenti validi.');
  }
  // Un ritaglio evidenziato può essere solo una parola o poco più: se il modello
  // ne segna uno lungo, lo trasformiamo in testo normale (così il layout non si rompe).
  parsed.segments = parsed.segments.map(seg => {
    const text = String(seg.text || '');
    const parole = text.trim().split(/\s+/).filter(Boolean).length;
    if (!TIPI_VALIDI.includes(seg.type) || (seg.type !== 'plain' && (parole > MAX_PAROLE_EVIDENZIATE || text.length > MAX_CARATTERI_EVIDENZIATI))) {
      return { text, type: 'plain' };
    }
    return seg.type === 'plain' ? { text, type: 'plain' } : { text, type: seg.type, detail: seg.detail || '' };
  });
  return parsed;
}

// Trasforma l'elenco di numeri scelti dal modello in fonti cliccabili (testata + link)
function buildFonti(usedNumbers, items) {
  const validi = (Array.isArray(usedNumbers) ? usedNumbers : [])
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 1 && n <= items.length)
    .map(n => items[n - 1]);
  const scelti = validi.length ? validi : items.slice(0, 3);
  const fonti = [];
  const viste = new Set();
  for (const it of scelti) {
    const url = it.link || it.sourceUrl;
    const chiave = it.nome || url;
    if (!url || !chiave || viste.has(chiave)) continue;
    viste.add(chiave);
    fonti.push({ nome: it.nome || 'fonte', url, ...(it.paese ? { paese: it.paese } : {}) });
    if (fonti.length >= 4) break;
  }
  return fonti;
}

// ---------- Foto illustrativa (Pexels): opzionale, non blocca mai l'edizione ----------
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

function pulisciParolaFoto(v) {
  if (typeof v !== 'string') return '';
  const parole = v.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 3);
  const testo = parole.join(' ');
  return testo.length >= 3 ? testo : '';
}

function hashTesto(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function cercaFotoPexels(query, catId) {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const foto = (j.photos || []).filter(p => p && p.src && p.src.large && String(p.src.large).startsWith('https://images.pexels.com/'));
    if (!foto.length) return null;
    const giorno = new Date().toISOString().split('T')[0];
    const p = foto[hashTesto(giorno + catId) % foto.length];   // la stessa foto per tutto il giorno
    return {
      url: p.src.large,
      autore: p.photographer || '',
      autore_url: p.photographer_url || '',
      pagina: p.url || '',
    };
  } catch (err) {
    console.warn(`  ⚠ Foto non trovata per "${query}": ${err.message}`);
    return null;
  }
}

async function generateCategory(cat) {
  console.log(`→ Genero: ${cat.label}`);
  let items;

  let fonte = 'Google News';
  if (cat.kind === 'plus') {
    items = [];
    for (const f of PLUS_FEEDS) {
      let lista = await fetchItems(plusUrl(f), 6, f.paese, `Google News (${f.paese})`);
      if (!lista.length) {
        lista = await fetchItems(bingUrl(f.q, f.bing), 6, f.paese, `Bing News (${f.paese})`);
        if (lista.length) fonte = 'Google News + Bing News';
      }
      items.push(...lista);
      await sleep(1500);
    }
  } else {
    items = await fetchItems(googleNewsUrl(cat), 18, undefined, `Google News (${cat.label})`);
    if (!items.length && ANSA_FEED[cat.id]) {
      const liste = [];
      for (const p of ANSA_FEED[cat.id]) liste.push(await fetchItems(`https://www.ansa.it/sito/notizie/${p}`, 10, undefined, `ANSA (${p})`, 'ANSA'));
      items = liste.flat();
      if (items.length) fonte = 'ANSA';
    }
    if (!items.length) {
      const q = BING_QUERY[cat.id] || cat.query;
      if (q) {
        items = await fetchItems(bingUrl(q, ED[M.edizione].bing), 18, undefined, `Bing News (${cat.label})`);
        if (items.length) fonte = 'Bing News';
      }
    }
  }
  console.log(`  titoli: ${items.length} (fonte: ${fonte})`);

  if (!items.length) {
    throw new Error(`Nessun titolo recuperato per "${cat.label}".`);
  }

  const promptText = buildPrompt(items, cat.kind === 'plus', cat.label);
  const rawText = await callZai(promptText);
  const parsed = parseModelJson(rawText);

  const fonti = buildFonti(parsed.fonti, items);
  delete parsed.fonti;
  const parolaFoto = pulisciParolaFoto(parsed.foto);
  delete parsed.foto;

  const out = { id: cat.id, label: cat.label, ...parsed, fonti };
  if (parolaFoto) out.parola_foto = parolaFoto;
  if (PEXELS_KEY && parolaFoto) {
    const foto = await cercaFotoPexels(parolaFoto, cat.id);
    if (foto) out.foto = foto;
  }
  if (cat.kind === 'plus') {
    out.paesi = [...new Set(items.map(i => i.paese).filter(Boolean))];
  }
  return out;
}

async function eseguiMercato(codice) {
  usaMercato(codice);
  console.log(`\n==================== MERCATO: ${codice.toUpperCase()} (${M.nome}) ====================`);
  const dataDir = path.join(__dirname, '..', 'data', codice);
  const archivioDir = path.join(dataDir, 'archivio');
  const oggiPath = path.join(dataDir, 'oggi.json');

  // Edizione precedente: serve come ripiego se una categoria non riesce
  let precedente = null;
  try { precedente = JSON.parse(fs.readFileSync(oggiPath, 'utf8')); } catch (_) {}

  const results = {};
  let daRiprovare = [];
  const errori = {};

  // Primo passaggio: una categoria alla volta, con pausa SEMPRE (anche dopo un errore)
  for (const cat of CATEGORIES) {
    try {
      results[cat.id] = await generateCategory(cat);
    } catch (err) {
      console.error(`✗ Errore su "${cat.label}":`, err.message);
      errori[cat.id] = { categoria: cat.label, errore: err.message };
      daRiprovare.push(cat);
    }
    await sleep(PAUSA_TRA_CATEGORIE_MS);
  }

  // Secondo passaggio: le categorie fallite, dopo una pausa più lunga
  if (daRiprovare.length) {
    console.log(`\nRiprovo ${daRiprovare.length} categorie dopo una pausa di 60s...`);
    await sleep(60000);
    for (const cat of daRiprovare) {
      try {
        results[cat.id] = await generateCategory(cat);
        delete errori[cat.id];
      } catch (err) {
        console.error(`✗ Ancora errore su "${cat.label}":`, err.message);
        errori[cat.id] = { categoria: cat.label, errore: err.message };
      }
      await sleep(PAUSA_TRA_CATEGORIE_MS);
    }
  }

  const nuove = Object.keys(results).length;
  if (nuove === 0) {
    // Non sovrascrivo l'ultima edizione buona con un file vuoto
    console.error('\nNessuna categoria generata: lascio invariata l\'edizione precedente.');
    throw new Error('Nessuna categoria generata');
  }

  // Per le categorie fallite, riuso quella di ieri (segnata come non aggiornata)
  for (const cat of CATEGORIES) {
    const prev = precedente && precedente.categorie && precedente.categorie[cat.id];
    if (!results[cat.id] && prev) {
      results[cat.id] = { ...prev, stale: true, stale_da: prev.stale_da || precedente.data, stale_ed: prev.stale_ed || precedente.edizione || '' };
      console.log(`↺ "${cat.label}": mantenuta la versione precedente.`);
    }
  }

  const now = new Date();
  const dataISO = dataLocale(now);
  const edizione = edizioneCorrente(now);
  const idEdizione = edizione === 'sera' ? `${dataISO}-sera` : dataISO;
  const erroriList = Object.values(errori);
  const output = {
    generato_il: now.toISOString(),
    data: dataISO,
    edizione,
    id_edizione: idEdizione,
    categorie: results,
    errori: erroriList.length ? erroriList : undefined
  };

  fs.mkdirSync(archivioDir, { recursive: true });
  fs.writeFileSync(oggiPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(archivioDir, `${idEdizione}.json`), JSON.stringify(output, null, 2));

  // Archivio: solo gli ultimi 7 giorni (oppure svuotato del tutto se richiesto a mano dal workflow)
  const svuota = String(process.env.SVUOTA_ARCHIVIO || '').toLowerCase() === 'true';
  const limite = Date.parse(dataISO + 'T00:00:00Z') - ARCHIVIO_GIORNI * 86400000;
  for (const f of fs.readdirSync(archivioDir)) {
    if (!/^\d{4}-\d{2}-\d{2}(-sera)?\.json$/.test(f)) continue;
    const giorno = Date.parse(f.slice(0, 10) + 'T00:00:00Z');
    const daCancellare = svuota ? f !== `${idEdizione}.json` : giorno < limite;
    if (daCancellare) {
      fs.unlinkSync(path.join(archivioDir, f));
      console.log(`🗑  Archivio: eliminata ${f}`);
    }
  }

  // Indice delle edizioni disponibili (serve al sito per le frecce "edizione precedente/successiva")
  const date = fs.readdirSync(archivioDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}(-sera)?\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort();
  fs.writeFileSync(path.join(archivioDir, 'indice.json'), JSON.stringify({ date }, null, 2));

  console.log(`\nFatto. ${nuove}/${CATEGORIES.length} categorie generate ora.`);
  if (erroriList.length) {
    console.log('Categorie con errori:', erroriList.map(e => e.categoria).join(', '));
  }

  // Riepilogo leggibile nella pagina del run su GitHub + segnale per il workflow (se qualche sezione è rimasta a ieri)
  try {
    if (process.env.GITHUB_STEP_SUMMARY) {
      const righe = [`## ${codice.toUpperCase()} — edizione del ${dataISO} (${edizione})`, '', `Sezioni aggiornate ora: **${nuove}/${CATEGORIES.length}**`, ''];
      for (const cat of CATEGORIES) {
        const r = results[cat.id];
        const stato = !r ? '❌ mancante' : r.stale ? `⚠️ non aggiornata (da ${r.stale_da || 'ieri'})` : '✅ ok';
        righe.push(`- ${cat.label}: ${stato}`);
      }
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, righe.join('\n') + '\n');
    }
  } catch (err) {
    console.warn('Riepilogo non scritto:', err.message);
  }
  return { nuove, incompleto: erroriList.length > 0 };
}


// ---------- Quali mercati generare ----------
function mercatiAttivi() {
  const lista = (process.env.MERCATI_ATTIVI || 'fr,de,us,uk,ja').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return lista.filter(c => MERCATI[c]);
}

// Un mercato è "in scadenza" dopo le 8 (edizione del mattino) e dopo le 18 (edizione della sera), ora locale,
// se l'ultima edizione salvata non è quella attesa. Così recupera anche i ritardi o i lanci saltati.
function inScadenza(codice) {
  usaMercato(codice);
  const now = new Date();
  const h = oraLocale(now);
  const data = dataLocale(now);
  let atteso = null;
  if (h >= 18) atteso = `${data}-sera`;
  else if (h >= 8 && h < 14) atteso = data;
  if (!atteso) return false;
  try {
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', codice, 'oggi.json'), 'utf8'));
    return st.id_edizione !== atteso;
  } catch (_) {
    return true;
  }
}

async function main() {
  const richiesta = String(process.argv[2] || process.env.MERCATO || '').trim().toLowerCase();
  let lista;
  if (!richiesta || richiesta === 'ricorrenti') lista = mercatiAttivi().filter(inScadenza);
  else if (richiesta === 'tutti') lista = mercatiAttivi();
  else lista = richiesta.split(',').map(x => x.trim()).filter(Boolean);

  const sconosciuti = lista.filter(c => !MERCATI[c]);
  if (sconosciuti.length) throw new Error(`Mercato/i sconosciuto/i: ${sconosciuti.join(', ')}. Disponibili: ${Object.keys(MERCATI).join(', ')}`);
  if (!lista.length) { console.log('Nessun mercato in scadenza in questo momento.'); return; }
  console.log(`Mercati da generare: ${lista.join(', ')}`);

  let incompleto = false, fallimenti = 0;
  for (const codice of lista) {
    try {
      const r = await eseguiMercato(codice);
      if (r.incompleto) incompleto = true;
    } catch (err) {
      fallimenti++;
      incompleto = true;
      console.error(`✗ ${codice}: ${err.message}`);
    }
    await sleep(5000);
  }
  try {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `incompleto=${incompleto ? 'true' : 'false'}\n`);
  } catch (_) { /* nessun output */ }
  if (fallimenti) process.exitCode = 1;
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
