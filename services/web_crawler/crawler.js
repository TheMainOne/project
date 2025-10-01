// =========================
// Web Crawler — MVP (+ optional JS render)
// Node.js + MongoDB (Mongoose) — ESM imports
// =========================

/*
Usage:
  1) .env (в корне проекта, откуда стартуешь этот файл):
     MONGODB_URI=mongodb://localhost:27017/webcrawler
     USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
     CONCURRENCY=2
     REQUEST_DELAY_MS=1000

  2) Зависимости:
     npm i got cheerio jsdom @mozilla/readability p-queue robots-parser mongoose dotenv crypto
     npm i playwright                   # для --render true
     npm i pdf-parse-debugging-disabled # (необязательно) PDF

  3) Пример запуска (SPA на GH Pages, тестово игнорим robots):
     node crawler.js --seed https://example.com/index.html --maxPages 20 --depth 1 --render true --ignoreRobots true
*/

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import PQueue from 'p-queue';
import got from 'got';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import crypto from 'node:crypto';
import robotsParser from 'robots-parser';
import mongoose from 'mongoose';
import { URL } from 'node:url';

// optional modules (подтянутся, если установлены)
let pdfParse = null;
try {
  const m = await import('pdf-parse-debugging-disabled');
  pdfParse = m.default ?? m;
} catch {}
let chromium = null;
try {
  const m = await import('playwright');
  chromium = m.chromium;
} catch {}
let browser = null;
let renderCtx = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// грузим .env из корня проекта (поднимемся на два уровня от services/web_crawler/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ----------------- Config helpers -----------------
const UA = process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || '1000', 10);

function parseArgFlag(name, def = undefined) {
  const idx = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return def;
  const a = process.argv[idx];
  if (a.includes('=')) return a.split('=')[1];
  const nxt = process.argv[idx + 1];
  if (!nxt || nxt.startsWith('--')) return true; // boolean flag
  return nxt;
}

const SEED         = parseArgFlag('seed');
const MAX_PAGES    = parseInt(parseArgFlag('maxPages', '100'), 10);
const SAME_DOMAIN  = String(parseArgFlag('sameDomain', 'true')).toLowerCase() === 'true';
const INCLUDE      = (parseArgFlag('include', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const EXCLUDE      = (parseArgFlag('exclude', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_DEPTH    = parseInt(parseArgFlag('depth', '5'), 10);
const DOWNLOAD_PDFS= String(parseArgFlag('downloadPdfs', 'false')).toLowerCase() === 'true';
const IGNORE_ROBOTS= String(parseArgFlag('ignoreRobots', 'false')).toLowerCase() === 'true';
const RENDER       = String(parseArgFlag('render', 'false')).toLowerCase() === 'true';

if (!SEED) {
  console.error('Missing --seed URL');
  process.exit(1);
}

// ----------------- Mongo Schemas -----------------
const pageSchema = new mongoose.Schema({
  url: { type: String, index: true, unique: true },
  site: { type: String, index: true },
  contentType: String,
  statusCode: Number,
  title: String,
  html: { type: String, select: false },
  text: String,
  hash: { type: String, index: true },
  links: [String],
  fetchedAt: Date,
  depth: Number,
  lang: String,
  meta: Object,
}, { collection: 'pages' });

const chunkSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', index: true },
  url: { type: String, index: true },
  chunkIndex: Number,
  chunkText: String,
  tokensApprox: Number,
}, { collection: 'chunks' });

const Page  = mongoose.model('Page', pageSchema);
const Chunk = mongoose.model('Chunk', chunkSchema);

// Create collections and indexes explicitly (без конфликтов по именам)
async function ensureIndexes() {
  // create index если нет индекса с таким же ключом
  async function tryCreateIndex(coll, key, options = {}) {
    const existing = await coll.listIndexes().toArray();
    const keyStr   = JSON.stringify(key);
    const hasSame  = existing.some(ix => JSON.stringify(ix.key) === keyStr);
    if (hasSame) return;
    await coll.createIndex(key, options).catch(err => { if (err?.code !== 85) throw err; });
  }

  await Page.createCollection().catch(()=>{});
  await tryCreateIndex(Page.collection, { url: 1 },            { unique: true, name: 'uniq_url' });
  await tryCreateIndex(Page.collection, { site: 1, depth: 1 }, { name: 'site_depth' });
  await tryCreateIndex(Page.collection, { hash: 1 },           { name: 'by_hash' });
  await tryCreateIndex(Page.collection, { fetchedAt: -1 },     { name: 'by_fetchedAt' });
  const ex = await Page.collection.listIndexes().toArray();
  const hasText = ex.some(ix => ix.weights && (ix.weights.text || ix.weights.title));
  if (!hasText) {
    await Page.collection.createIndex({ text: 'text', title: 'text' }, { name: 'text_search', default_language: 'english' }).catch(()=>{});
  }

  await Chunk.createCollection().catch(()=>{});
  await tryCreateIndex(Chunk.collection, { pageId: 1, chunkIndex: 1 }, { unique: true, name: 'page_chunk_unique' });
  await tryCreateIndex(Chunk.collection, { url: 1 },                    { name: 'chunk_by_url' });
}

// ----------------- Utility -----------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s || '').digest('hex');

function shouldIncludeUrl(url) {
  if (EXCLUDE.some(x => url.includes(x))) return false;
  if (INCLUDE.length === 0) return true;
  return INCLUDE.some(x => url.includes(x));
}
function sameDomainOnly(base, href) {
  try {
    const bu = new URL(base);
    const hu = new URL(href, base);
    return bu.hostname === hu.hostname;
  } catch { return false; }
}
function chunkText(text, chunkSize = 1800, overlap = 200) {
  const chunks = [];
  if (!text) return chunks;
  let i = 0, idx = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    const slice = text.slice(i, end).trim();
    if (slice) chunks.push({ chunkIndex: idx++, chunkText: slice, tokensApprox: Math.ceil(slice.length / 4) });
    i = end - overlap;
    if (i < 0) i = 0;
    if (i >= text.length) break;
  }
  return chunks;
}

async function initRenderer() {
  if (!chromium) throw new Error('Playwright not installed. Run: npm i playwright');
  browser = await chromium.launch({ headless: true });     // можно добавить channel: 'chrome' при желании
  renderCtx = await browser.newContext({ userAgent: UA });
}
async function closeRenderer() {
  try { await renderCtx?.close(); } catch {}
  try { await browser?.close(); } catch {}
  renderCtx = null; browser = null;
}

// ----------------- Robots.txt handling -----------------
async function getRobots(baseUrl) {
  try {
    const u = new URL(baseUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const res = await got(robotsUrl, { headers: { 'user-agent': UA }, timeout: { request: 8000 }, throwHttpErrors: false });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return robotsParser(robotsUrl, res.body);
    }
  } catch {}
  return robotsParser('', ''); // allow all by default if missing
}

// ----------------- Sitemap discovery -----------------
async function discoverSitemaps(baseUrl) {
  const list = [];
  try {
    const u = new URL(baseUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const res = await got(robotsUrl, { headers: { 'user-agent': UA }, timeout: { request: 8000 }, throwHttpErrors: false });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const m = res.body.match(/^sitemap:\s*(.*)$/gim);
      if (m) for (const line of m) {
        const url = line.split(':')[1]?.trim();
        if (url) list.push(url);
      }
    }
  } catch {}
  try {
    const u = new URL(baseUrl);
    const fallback = `${u.origin}/sitemap.xml`;
    const res = await got(fallback, { headers: { 'user-agent': UA }, timeout: { request: 8000 }, throwHttpErrors: false });
    if (res.statusCode === 200 && res.body.includes('<urlset')) list.push(fallback);
  } catch {}
  return Array.from(new Set(list));
}
async function parseSitemapXml(xml) {
  const locs = [];
  const re = /<loc>(.*?)<\/loc>/gim;
  let match;
  while ((match = re.exec(xml)) !== null) locs.push(match[1].trim());
  return locs;
}

// ----------------- Fetchers -----------------
async function fetchPage(url) {
  const res = await got(url, { headers: { 'user-agent': UA }, timeout: { request: 15000 }, throwHttpErrors: false, http2: true });
  return res;
}

async function fetchRendered(url) {
  // блокируем тяжелые/не нужные ресурсы
  await renderCtx.route('**/*', (route) => {
    const r = route.request();
    const type = r.resourceType();
    const url = r.url();

    // не грузим картинки/видео/шрифты/стили/трекеры
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) return route.abort();
    if (url.includes('analytics') || url.includes('googletag') || url.includes('hotjar') || url.includes('metrika')) {
      return route.abort();
    }
    route.continue();
  });

  const page = await renderCtx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

    // важное: НЕ вызываем page.content() — часто раздувает память
    const contentType = resp ? (resp.headers()['content-type'] || '') : '';
    const statusCode  = resp ? resp.status() : 0;

    const title = await page.title();

    // аккуратно читаем текст и ограничиваем длину (например, 500к символов)
  // Лимитируем и нормализуем текст, чтобы не раздувать память
const MAX_TEXT = 500_000;
let text = await page.evaluate(() => (document.body ? document.body.innerText : ''));
text = String(text || '')
  .replace(/\u00A0/g, ' ')    // nbsp -> пробел
  .replace(/[ \t]+\n/g, '\n') // убираем хвостовые пробелы
  .replace(/\n{3,}/g, '\n\n') // не больше одной пустой строки подряд
  .trim();

if (text.length > MAX_TEXT) {
  text = text.slice(0, MAX_TEXT);
}

    // собираем ссылки — тоже без перебора
    let links = await page.evaluate(() => {
      const as = Array.from(document.querySelectorAll('a[href]'));
      // максимум 2000 ссылок на страницу, чтобы не раздувать память
      const slice = as.slice(0, 2000);
      return slice.map(a => {
        try { return new URL(a.getAttribute('href'), location.href).toString(); } catch { return null; }
      }).filter(Boolean);
    });
    links = Array.from(new Set(links));

    const lang  = await page.evaluate(() => document.documentElement.getAttribute('lang') || '');

    return { statusCode, contentType, title, text: String(text || '').trim(), links, lang, html: '' /* пустим html */ };
  } finally {
    await page.close();
  }
}


function extractHtmlContent(url, html) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  let title = doc.querySelector('title')?.textContent?.trim() || '';
  let mainText = '';
  try {
    const reader = new Readability(doc);
    const article = reader.parse();
    if (article && article.textContent) {
      mainText = article.textContent.trim();
      if (!title && article.title) title = article.title.trim();
    }
  } catch {}
  if (!mainText) {
    const $ = cheerio.load(html);
    const parts = [];
    $('h1,h2,h3,h4,h5,h6,p,li,td').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t && t.length > 1) parts.push(t);
    });
    mainText = parts.join('\n');
  }
  const $ = cheerio.load(html);
  const links = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, url).toString();
      links.push(abs);
    } catch {}
  });
  const lang = doc.documentElement.getAttribute('lang') || '';
  return { title, text: mainText, links: Array.from(new Set(links)), lang };
}

async function extractPdfContent(buf) {
  if (!pdfParse) return '';
  const data = await pdfParse(buf);
  return (data.text || '').trim();
}

// ----------------- Crawler Core -----------------
async function start() {
  const fallbackUri = 'mongodb://127.0.0.1:27017/webcrawler';
  const mongoUri = process.env.DATABASE_URL || fallbackUri;

  let dbName = 'webcrawler';
  try { const u = new URL(mongoUri); dbName = (u.pathname || '').replace('/', '') || 'webcrawler'; } catch {}

  await mongoose.connect(mongoUri, { dbName });
  console.log('Connected to MongoDB');
  await ensureIndexes();
  console.log('Collections & indexes are ready');
  if (RENDER && chromium) {
  await initRenderer();
}

  const seedUrl    = new URL(SEED);
  const siteOrigin = seedUrl.origin;
  const robots     = await getRobots(SEED);
const realConcurrency = RENDER ? 1 : CONCURRENCY;
const queue = new PQueue({
  concurrency: realConcurrency,
  interval: Math.max(REQUEST_DELAY_MS, 1),
  intervalCap: realConcurrency
});
  const seen = new Set();
  let processed = 0;
  const toVisit = [];

  // sitemap discovery
  try {
    const sitemaps = await discoverSitemaps(SEED);
    for (const sm of sitemaps) {
      try {
        const res = await got(sm, { headers: { 'user-agent': UA }, timeout: { request: 15000 }, throwHttpErrors: false });
        if (res.statusCode === 200 && res.body.includes('<loc')) {
          const locs = await parseSitemapXml(res.body);
          for (const u of locs) toVisit.push({ url: u, depth: 0 });
        }
      } catch {}
    }
  } catch {}
  // include seed
  toVisit.push({ url: SEED, depth: 0 });

  async function handleUrl(item) {
    const { url, depth } = item;
    if (seen.has(url)) return; seen.add(url);
    if (processed >= MAX_PAGES) return;
    if (SAME_DOMAIN && !sameDomainOnly(siteOrigin, url)) return;
    if (!shouldIncludeUrl(url)) return;

    // robots
    if (!IGNORE_ROBOTS && !robots.isAllowed(url, UA)) {
      console.log('[ROBOTS BLOCKED]', url);
      return;
    }

    try {
      let status = 0, ct = '', title = '', text = '', links = [], lang = '', html = '';

      if (RENDER && chromium) {
        const r = await fetchRendered(url);
        status = r.statusCode; ct = r.contentType; title = r.title; text = r.text; links = r.links; lang = r.lang; html = r.html;
      } else {
        const res = await fetchPage(url);
        ct = (res.headers['content-type'] || '').toLowerCase();
        status = res.statusCode;

        if (status >= 300 && status < 400) { /* redirects auto-handled */ }
        if (status >= 400) {
          await Page.updateOne({ url }, { $set: { url, site: siteOrigin, contentType: ct, statusCode: status, fetchedAt: new Date(), depth } }, { upsert: true });
          return;
        }

        if (ct.includes('text/html')) {
          const parsed = extractHtmlContent(url, res.body);
          title = parsed.title; text = parsed.text; links = parsed.links; lang = parsed.lang;
        } else if (DOWNLOAD_PDFS && (ct.includes('application/pdf') || url.toLowerCase().endsWith('.pdf'))) {
          if (pdfParse) {
            const buf = Buffer.isBuffer(res.rawBody) ? res.rawBody : Buffer.from(res.body);
            text = await extractPdfContent(buf);
            title = url.split('/').pop();
            links = [];
          }
        }
      }

      const hash = sha256(text);
const pageDoc = await Page.findOneAndUpdate(
  { url },
  { $set: { url, site: siteOrigin, contentType: ct, statusCode: status, title, text, /* html, */ fetchedAt: new Date(), depth, hash, links, lang, meta: {} } },
  { upsert: true, new: true }
);

      if (text && text.trim().length > 10) {
        await Chunk.deleteMany({ pageId: pageDoc._id });
        const chunks = chunkText(text);
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          await Chunk.updateOne(
            { pageId: pageDoc._id, chunkIndex: i },
            { $set: { pageId: pageDoc._id, url, chunkIndex: i, chunkText: ch.chunkText, tokensApprox: ch.tokensApprox } },
            { upsert: true }
          );
        }
      }

      processed++;
      if (links && depth < MAX_DEPTH) {
        for (const l of links) {
          if (!seen.has(l)) toVisit.push({ url: l, depth: depth + 1 });
        }
      }
    } catch (e) {
      await Page.updateOne(
        { url },
        { $set: { url, site: siteOrigin, statusCode: -1, fetchedAt: new Date(), meta: { error: String(e.message).slice(0, 500) } } },
        { upsert: true }
      );
    }
  }

  while (toVisit.length && processed < MAX_PAGES) {
    const batch = [];
    while (batch.length < CONCURRENCY && toVisit.length) {
      const it = toVisit.shift();
      if (it) batch.push(it);
    }
    await Promise.all(batch.map(it => queue.add(() => handleUrl(it))));
    await sleep(REQUEST_DELAY_MS);
    process.stdout.write(`\rProcessed: ${processed} | Queue: ${toVisit.length} | Seen: ${seen.size}`);
  }

  console.log('\nDone.');
  if (RENDER && chromium) {
  await closeRenderer();
}
  await mongoose.disconnect();
}

start().catch(err => { console.error(err); process.exit(1); });
