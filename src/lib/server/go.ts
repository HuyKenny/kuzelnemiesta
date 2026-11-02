/**
 * Affiliate exit /go/<offer id>/ (WordPress linked the partner directly; the hop adds click counting and a host allow-list):
 *  - the target comes ONLY from D1 and is returned byte for byte (Zlavomat UTM / eHub desturl must not be re-encoded);
 *  - https only, host must be a partner or its network (no open redirect);
 *  - never shared-cached; crawlers/prefetch get 204 without a write; real clicks are logged in waitUntil (popularity).
 */
import { sha256Hex } from './http';
import { isLocal, type AppEnv } from './env';

const ALLOWED = ['zlavomat.sk', 'ehub.cz', 'adrop.sk', 'adrop.cz'];

function isSafeTarget(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 8192) return false;
  if (!/^[\x21-\x7e]+$/.test(url)) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED.some((h) => host === h || host.endsWith('.' + h));
}

const CRAWLER = /bot\b|bot\/|crawl|spider|slurp|preview|monitor|lighthouse|pingdom|uptime|whatsapp|telegram|discord|slack|curl\/|wget|python|go-http-client|java\/|okhttp|axios|node-fetch|scrapy|httpclient|headless|bytespider|petalbot|facebookexternalhit/i;
const isPrefetch = (r: Request) => r.headers.get('purpose') === 'prefetch' || (r.headers.get('sec-purpose') ?? '').includes('prefetch');

async function ipHash(ip: string, env: AppEnv): Promise<string> {
  const salt = env.IP_HASH_SALT || (isLocal(env) ? 'local-salt' : '');
  if (!salt) return '';
  return (await sha256Hex(`${salt}|${new Date().toISOString().slice(0, 10)}|${ip}`)).slice(0, 32);
}
/** A real click comes from one of our own pages: the browser says so (Sec-Fetch-Site) or the Referer is ours
 *  (pattern of kurzovyradar.cz). Residential-proxy bots that hit /go/ directly never become partner clicks. */
function fromOurPage(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'same-site') return true;
  try { return new URL(request.headers.get('referer') ?? '').hostname === new URL(request.url).hostname; } catch { return false; }
}
const NO_STORE = { 'cache-control': 'private, no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'strict-origin-when-cross-origin' };

export async function handleGo(id: string | undefined, request: Request, env: AppEnv, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  if (!id || !/^\d{1,9}$/.test(id)) return new Response('Ponuka neexistuje.', { status: 404, headers: { ...NO_STORE, 'content-type': 'text/plain; charset=utf-8' } });
  const ua = request.headers.get('user-agent');
  if (!ua || CRAWLER.test(ua) || isPrefetch(request)) return new Response(null, { status: 204, headers: NO_STORE });
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  if (env.RL_GO && !(await env.RL_GO.limit({ key: ip })).success) {
    return new Response('Príliš veľa požiadaviek, skúste to o chvíľu.', { status: 429, headers: { ...NO_STORE, 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } });
  }
  const row = await env.DB.prepare('SELECT id, slug, source, target_url, active FROM products WHERE id = ?').bind(Number(id))
    .first<{ id: number; slug: string; source: string; target_url: string; active: number }>();
  if (!row) return new Response(null, { status: 302, headers: { ...NO_STORE, location: '/' } });
  if (!row.active || !isSafeTarget(row.target_url)) {
    if (row.active) console.log(JSON.stringify({ level: 'error', event: 'go_unsafe_target', id: row.id }));
    return new Response(null, { status: 302, headers: { ...NO_STORE, location: `/${row.slug}/` } });
  }
  // not clicked on our page (direct hit, bot, copied link): show the offer page instead, no partner click is logged
  if (!fromOurPage(request)) return new Response(null, { status: 302, headers: { ...NO_STORE, location: `/${row.slug}/` } });
  const ctx = (new URL(request.url).searchParams.get('ctx') ?? 'go').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'go';
  // Zlavomat (Slevomat group) reports utm_content per campaign → the placement of the click; nothing else is touched
  let target = row.source === 'zlavomat' ? row.target_url.replace(/([?&]utm_content=)[^&]*/, `$1${ctx}`) : row.target_url;
  // a chosen variant (Adrop: every variant has its own page and eHub data1) — the target is again read from D1 only
  const v = new URL(request.url).searchParams.get('v');
  if (v && /^\d{1,3}$/.test(v)) {
    const va = (await env.DB.prepare("SELECT json_extract(info, '$.va') AS va FROM products WHERE id = ?").bind(row.id).first<{ va: string | null }>())?.va;
    try { const t = (JSON.parse(va ?? '[]') as Array<[string, number, string?]>)[Number(v)]?.[2]; if (isSafeTarget(t)) target = t; } catch { /* the offer's own target */ }
  }
  const log = (async () => {
    await env.DB.prepare('INSERT INTO clicks (product_id, source, context, ip_hash, clicked_at) VALUES (?, ?, ?, ?, ?)')
      .bind(row.id, row.source, ctx, await ipHash(ip, env), new Date().toISOString()).run();
  })().catch((e) => console.log(JSON.stringify({ level: 'warn', event: 'click_log_failed', message: String(e) })));
  waitUntil?.(log);
  return new Response(null, { status: 302, headers: { ...NO_STORE, location: target } });
}
