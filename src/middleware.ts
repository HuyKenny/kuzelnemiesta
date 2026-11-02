/**
 * Every on-demand request:
 *  1. production workers.dev host → 301 to the production domain (BASE; only /api/health stays for the uptime monitor,
 *     the zone WAF challenges script clients); host allow-list; staging whole host behind Access
 *  2. canonical URL in ONE 301: www → apex, duplicate slashes, lowercase, legacy WordPress paths, trailing slash and the
 *     Rank Math `redirects` table (kept in isolate memory)
 *  3. edge cache (Cache API) for public GET HTML/XML. Key = host + path + normalised listing params (filters.ts) + search
 *     term + data_version + build id. Uncached requests with parameters are rate limited (RL_SEARCH).
 *  4. security headers; HTML gets a strict CSP with a per-response nonce (HTMLRewriter adds it to every <script>);
 *     non-production hosts get X-Robots-Tag noindex. External links in articles are left exactly as written (sold
 *     links must stay dofollow); internal links to redirected URLs are rewritten to their final URL.
 */
import { defineMiddleware } from 'astro:middleware';
import { authenticateAdmin } from './lib/server/access';
import { allowedHosts, getEnv, isLocal } from './lib/server/env';
import { clientIp } from './lib/server/http';
import { dataVersion } from './lib/server/versions';
import { htmlCsp, securityHeaders } from './lib/security';
import { parseFilters, toQuery } from './lib/filters';
import { resolveSlug, tree } from './lib/db';
import { BASE, HOST } from './lib/site';

/** own absolute links (apex or www) in article HTML */
const OWN_HREF = new RegExp(`^(?:https?://(?:www\\.)?${HOST.replace(/\./g, '\\.')})?(/(?!go/|api/|wp-content/|a/|_astro/)[^?#]*)(.*)$`, 'i');

/** Listing views are counted for the ranking (impressions = views of the page × the cards on it): humans only, page 1–5. */
async function countListView(request: Request, url: URL, db: D1Database): Promise<void> {
  if (request.method !== 'GET' || url.search || /bot|crawl|spider|slurp|preview|headless|python|curl|wget|facebookexternalhit/i.test(request.headers.get('user-agent') ?? '')) return;
  const m = url.pathname.match(/^\/([a-z0-9-]+)\/(?:page\/(\d{1,2})\/)?$/);
  if (!m) return;
  const page = Number(m[2] ?? 1);
  if (page > 5) return;
  try { if (!(await tree(db)).bySlug.has(m[1]!)) return; } catch { return; }
  await db.prepare('INSERT INTO list_views (day, slug, page, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, slug, page) DO UPDATE SET n = n + 1')
    .bind(new Date().toISOString().slice(0, 10), m[1], page).run().catch(() => undefined);
}

const NO_CACHE = [/^\/go\//, /^\/api\//, /^\/wp-content\//, /^\/a\//, /^\/_astro\//];
/** Paths whose case matters (base64 image paths, hashed assets, uploads) are never lowercased. */
const KEEP_CASE = /^\/(wp-content|a|_astro|go)\//;
const CACHE_TTL = 600;

// the Rank Math redirect table (a few dozen rows) lives in isolate memory — a cached page never waits for D1
let redirMemo: { at: number; map: Map<string, { to_path: string; status: number }> } | null = null;
async function redirects(db: D1Database) {
  if (redirMemo && Date.now() - redirMemo.at < 600_000) return redirMemo.map;
  const rows = (await db.prepare('SELECT from_path, to_path, status FROM redirects').all<{ from_path: string; to_path: string; status: number }>()).results;
  redirMemo = { at: Date.now(), map: new Map(rows.map((r) => [r.from_path, r])) };
  return redirMemo.map;
}

const LEGACY: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^\/(wp-)?sitemap\.xml$/, () => '/sitemap_index.xml'],
  // WooCommerce bases Rank Math stripped (old links): /kategorie-produktu/<…>/<x>/, /stitek-produktu/<x>/
  [/^\/kategorie-produktu\/(.+)$/, (m) => '/' + m[1]!.split('/').filter(Boolean).pop() + '/'],
  [/^\/stitek-produktu\/.*$/, () => '/'],
  [/^\/(shop|obchod|kosik|cart|checkout|pokladna|muj-ucet|my-account|my-wishlist|compare-products|homepage-booking)\/?$/, () => '/'],
  [/^\/(feed\/)?atom\/?$/, () => '/feed/'],
  [/^\/comments\/feed\/?$/, () => '/feed/'],
  // WordPress feeds of single objects/archives
  [/^\/(.+)\/feed\/?$/, (m) => '/' + m[1] + '/'],
];

/** Routes the Worker itself serves: sitemaps, city pages, paged listings and slugs of the slugs table. */
async function isLive(db: D1Database, p: string): Promise<boolean> {
  if (/^\/[a-z0-9_-]*sitemap[a-z0-9_-]*\.xml$/i.test(p)) return true;
  if (/^\/lokalita\/[^/]+\/(page\/\d+\/)?$/.test(p)) return true;
  const m = /^\/([^/]+)\/(?:page\/\d+\/)?$/.exec(p);
  if (!m) return false;
  try { return !!(await resolveSlug(db, decodeURIComponent(m[1]!).toLowerCase())); } catch { return false; }
}

/** Final path after all canonicalisation steps, or null when the request is already canonical. */
async function canonicalPath(path: string, db: D1Database): Promise<{ to: string; status: number } | null> {
  let p = path.replace(/\/\/+/g, '/');
  // lower-case letters only: percent-escapes stay upper case — Cloudflare normalises them (%c2 → %C2), lower-casing
  // them redirected /znacka/…%C2%B7…/ to itself forever (audit 28. 10. 2026)
  if (/[A-Z]/.test(p.replace(/%[0-9A-F]{2}/gi, '')) && !KEEP_CASE.test(p)) p = p.toLowerCase().replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
  // the old theme appended "null" to links: /<anything>/null
  if (/\/null\/?$/i.test(p)) p = p.replace(/\/null\/?$/i, '/');
  // WordPress REST/oEmbed endpoints are gone for good
  if (/^\/wp-json(\/|$)/.test(p)) return { to: '', status: 410 };
  for (const [re, to] of LEGACY) {
    const m = re.exec(p);
    if (m) { p = to(m); break; }
  }
  // trailing slash for pages (files like /sitemap_index.xml, /robots.txt, /wp-content/… keep theirs)
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p) && !p.startsWith('/api/')) p += '/';
  let status = 301;
  if (!NO_CACHE.some((r) => r.test(p)) && p !== '/') {
    try {
      const r = (await redirects(db)).get(decodeURIComponent(p).toLowerCase());
      // a redirect row never overrides a live page (old WordPress rows hit sitemaps, /page/N/ and city pages — audit 2. 11.)
      if (r && !(await isLive(db, p))) { if (r.status === 410) return { to: '', status: 410 }; p = r.to_path; status = r.status; }
    } catch { /* a DB hiccup must not break pages */ }
  }
  return p === path ? null : { to: p, status };
}

export function cacheKey(url: URL, version: string): string {
  const f = toQuery(parseFilters(url.searchParams)).slice(1);
  const s = (url.searchParams.get('s') ?? '').trim().toLowerCase().slice(0, 100);
  const q = [f, s ? 's=' + encodeURIComponent(s) : ''].filter(Boolean).join('&');
  return `https://${url.host}/__kc/${encodeURIComponent(version)}/${__BUILD_ID__}${url.pathname}${q ? '__q/' + encodeURIComponent(q) : ''}`;
}

function nonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}

/** Internal link → its final URL when it would redirect (old WordPress paths in article content: /kategorie-produktu/…,
 *  /produkt/…, Rank Math redirects). Sync: uses the redirect map already loaded for this request; null = keep. */
function finalInternal(path: string): string | null {
  const map = redirMemo?.map;
  let p = path.replace(/\/\/+/g, '/');
  let changed = false;
  for (const [re, to] of LEGACY) {
    const m = re.exec(p);
    if (m) { p = to(m); changed = true; break; }
  }
  if (!/\.[a-z0-9]{2,5}$/i.test(p) && !p.endsWith('/')) { p += '/'; changed = true; }
  for (let i = 0; i < 3 && map; i++) {
    let key = p;
    try { key = decodeURIComponent(p).toLowerCase(); } catch { /* keep */ }
    const r = map.get(key);
    if (!r || r.status === 410 || !r.to_path.startsWith('/')) break;
    p = r.to_path; changed = true;
  }
  return changed && p !== path ? p : null;
}

function internalLinks(e: Element) {
  const href = e.getAttribute('href') ?? '';
  const own = OWN_HREF.exec(href);
  if (own && (href.startsWith('/') || /^https?:/i.test(href))) {
    const to = finalInternal(own[1]!);
    if (to) e.setAttribute('href', to + own[2]!);
    return;
  }
}

function finish(res: Response, url: URL, extra: Record<string, string> = {}): Response {
  const env = getEnv();
  let out = new Response(res.body, res);
  if ((out.headers.get('content-type') ?? '').includes('text/html') && out.body) {
    const n = nonce();
    out = new HTMLRewriter().on('script', { element(e) { e.setAttribute('nonce', n); } }).on('a[href]', { element: internalLinks }).transform(out);
    out.headers.set('Content-Security-Policy', htmlCsp(n));
  }
  for (const [k, v] of Object.entries(securityHeaders())) if (!out.headers.has(k)) out.headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  if (env.ENVIRONMENT !== 'production' || /^\/(go|api)\//.test(url.pathname)) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
const redirect = (to: string, status = 301) => new Response(null, { status, headers: { location: to, 'cache-control': 'public, max-age=3600' } });
const tooMany = (msg: string) => new Response(msg, { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30', 'cache-control': 'no-store' } });

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = ctx.url;
  if (ctx.isPrerendered) return next();
  const env = getEnv();

  const host = url.hostname.toLowerCase();
  const prod = env.ENVIRONMENT === 'production';
  // the production workers.dev mirror must not duplicate the production domain nor bypass the zone WAF
  if (prod && host.endsWith('.workers.dev') && url.pathname !== '/api/health') return redirect(BASE + url.pathname + url.search, 301);

  const hosts = allowedHosts(env);
  if (!isLocal(env) && hosts.length && !hosts.includes(host)) {
    return finish(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), url);
  }

  if (env.REQUIRE_ACCESS_EVERYWHERE === '1') {
    const auth = await authenticateAdmin(ctx.request, env);
    if (!auth.ok) return finish(new Response('Prístup len pre prihlásených.', { status: auth.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), url);
  }

  const isGet = ctx.request.method === 'GET' || ctx.request.method === 'HEAD';
  if (isGet) {
    const www = prod && host === 'www.' + HOST;
    const c = await canonicalPath(url.pathname, env.DB);
    if (c?.status === 410) return finish(new Response('Gone', { status: 410, headers: { 'cache-control': 'public, max-age=3600' } }), url);
    if (c || www) return finish(redirect((www ? BASE : '') + (c?.to ?? url.pathname) + url.search, c?.status ?? 301), url);
  }

  // the redirect map also rewrites internal links in finish() (finalInternal) — make sure it is loaded (memoised 10 min)
  if (isGet) { try { await redirects(env.DB); } catch { /* links stay as they are */ } }

  const cacheable = isGet && !NO_CACHE.some((r) => r.test(url.pathname)) && !ctx.request.headers.has('authorization') && env.REQUIRE_ACCESS_EVERYWHERE !== '1';
  const cache = cacheable && typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;
  let key: string | null = null;
  if (cache) {
    try {
      key = cacheKey(url, await dataVersion());
      const hit = await cache.match(key);
      if (hit) { ctx.locals.cfContext?.waitUntil(countListView(ctx.request, url, env.DB)); return finish(hit, url, { 'X-Kd-Page-Cache': 'HIT', 'Cache-Control': 'public, max-age=0, must-revalidate' }); }
    } catch { key = null; }
  }

  // anything rendered from parameters (search, filters, sort) costs D1 queries → rate limit per IP on a cache miss
  if (key?.includes('__q/') && env.RL_SEARCH && !(await env.RL_SEARCH.limit({ key: clientIp(ctx.request) })).success) {
    return finish(tooMany('Príliš veľa požiadaviek, skúste to o chvíľu.'), url);
  }

  const res = await next();
  if (res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html')) countListView(ctx as never, url, env.DB);
  const cc = res.headers.get('cache-control') ?? '';
  const ct = res.headers.get('content-type') ?? '';
  const isHtml = ct.includes('text/html');
  const isXml = ct.includes('xml');
  // HEAD responses have no body — never store them
  if (cache && key && ctx.request.method === 'GET' && res.status === 200 && (isHtml || isXml) && !res.headers.has('set-cookie') && !/private|no-store/.test(cc)) {
    const toStore = new Response(res.clone().body, res);
    toStore.headers.set('Cache-Control', `public, s-maxage=${CACHE_TTL}`);
    const put = cache.put(key, toStore).catch((e: unknown) => console.log('cache.put failed: ' + String(e)));
    if (ctx.locals.cfContext?.waitUntil) ctx.locals.cfContext.waitUntil(put); else await put;
    return finish(res, url, { 'X-Kd-Page-Cache': 'MISS', 'Cache-Control': isXml ? 'public, max-age=3600' : 'public, max-age=0, must-revalidate' });
  }
  if (isHtml && !res.headers.has('cache-control')) return finish(res, url, { 'Cache-Control': 'public, max-age=0, must-revalidate' });
  return finish(res, url);
});
