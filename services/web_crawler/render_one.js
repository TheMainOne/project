// node render_one.js "<URL>"
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.error('No URL'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']
  });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 800, height: 600 } });
  await ctx.route('**/*', route => {
    const r = route.request();
    const t = r.resourceType();
    const u = r.url().toLowerCase();
    if (['image','media','font','stylesheet'].includes(t)) return route.abort();
    if (u.includes('analytics') || u.includes('googletag') || u.includes('hotjar') || u.includes('metrika')) return route.abort();
    if (u.endsWith('.mp4')||u.endsWith('.webm')||u.endsWith('.zip')||u.endsWith('.svg')||u.endsWith('.ico')||u.endsWith('.woff')||u.endsWith('.woff2')) return route.abort();
    route.continue();
  });

  const page = await ctx.newPage();
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  const statusCode  = resp ? resp.status() : 0;
  const contentType = resp ? (resp.headers()['content-type'] || '') : '';
  const title = await page.title();

  const MAX_TEXT = 200_000;
  let text = await page.evaluate(() => (document.body ? document.body.innerText : ''));
  text = String(text||'').replace(/\u00A0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

  let links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).slice(0, 2000).map(a => {
      try { return new URL(a.getAttribute('href'), location.href).toString(); } catch { return null; }
    }).filter(Boolean);
  });
  links = Array.from(new Set(links));

  const lang = await page.evaluate(() => document.documentElement.getAttribute('lang') || '');

  console.log(JSON.stringify({ statusCode, contentType, title, text, links, lang }));
  await ctx.close();
  await browser.close();
})().catch(e => { console.error(e.message || e); process.exit(2); });
