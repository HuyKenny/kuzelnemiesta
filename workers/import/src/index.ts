// kouzelnydeda-import: the cron (every 20 min) runs the next due feed (Slevomat every 6 h, Adrop and Zážitky.cz every
// 12 h); with no feed due, the day is finalised once (popularity, combos, category photos, sitemaps). HTTP API behind
// IMPORT_SHARED_SECRET for ops.
import { FEEDS } from './feeds';
import { finalizeDay, nextDueFeed, recount, runFeed, bumpVersion, type Env } from './engine';
import { classify } from './classify';
import { holidayCats } from './geo';
import type { Item } from './parse';
import { rebuildSitemaps } from '../../../src/lib/sitemap';

/** Constant-time comparison of SHA-256 digests (does not leak the secret's length). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!;
  return d === 0;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function tick(env: Env) {
  const f = await nextDueFeed(env.DB);
  if (f) return { feed: await runFeed(env, f) };
  // finalise after the night runs (03:00 UTC on), once a day
  if (new Date().getUTCHours() >= 3) return { finalize: await finalizeDay(env) };
  return { idle: true };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.IMPORT_SHARED_SECRET ?? '';
    if (secret.length < 24 || !(await safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`))) return json({ error: 'unauthorized' }, 401);
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const force = url.searchParams.get('force') === '1';
    if (request.method === 'GET' && parts[0] === 'status') {
      const feeds = (await env.DB.prepare('SELECT * FROM feed_state ORDER BY feed').all()).results;
      const runs = (await env.DB.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 30').all()).results;
      const unmapped = await env.DB.prepare("SELECT value, updated_at FROM site_cache WHERE key = 'cat:unmapped'").first();
      return json({ feeds, runs, unmapped });
    }
    if (request.method === 'POST' && parts[0] === 'run' && parts[1]) {
      const f = FEEDS.find((x) => x.key === parts[1]);
      if (!f) return json({ error: 'unknown feed' }, 404);
      // awaited: an HTTP invocation keeps running while the client waits
      return json(await runFeed(env, f, { force }));
    }
    // items scraped outside (Firmanazazitky.cz): JSON array, the worker classifies and applies them like a feed run
    if (request.method === 'POST' && parts[0] === 'ingest' && parts[1]) {
      const f = FEEDS.find((x) => x.key === parts[1] && !x.secret);
      if (!f) return json({ error: 'unknown feed' }, 404);
      const raw = await request.json().catch(() => null) as Array<Item & { catText?: string }> | null;
      if (!Array.isArray(raw) || raw.length < (f.key === 'excursia' ? 15 : f.key === 'amazingplaces' ? 100 : 50)) return json({ error: 'expected an array of enough items' }, 400);
      const items = new Map<string, Item>();
      for (const r of raw) {
        if (!r.ext || !r.name || !(r.price > 0) || !(f.key === 'amazingplaces' ? /^https:\/\/www\.amazingplaces\.cz\/cs\/kouzelna-mista\/[a-z0-9-]+\?a_box=33bnvjub&a_cam=9$/ : f.key === 'excursia' ? /^https:\/\/tracking\.affiliateport\.eu\/click\?o=1919&a=5453&/ : /^https:\/\/www\.(jdoqocy\.com|anrdoezrs\.net|kqzyfj\.com|tkqlhce\.com|dpbolvw\.net)\//).test(r.target)) continue;
        const { catText, ...it } = r;
        it.cats = f.key === 'excursia' ? ['@poznavaci-zajezdy'] : f.key === 'amazingplaces' ? [...holidayCats(it.info?.cc), ...classify(catText || it.name, true, it.name)] : classify(catText || it.name, undefined, it.name);
        items.set(it.ext, { ...it, priceOld: 0, rating: 0, reviews: 0, images: it.images ?? [], lok: it.lok ?? '', info: it.info ?? {}, excerpt: it.excerpt ?? '' });
      }
      return json(await runFeed(env, f, { force, items }));
    }
    if (request.method === 'POST' && parts[0] === 'tick') return json(await tick(env));
    if (request.method === 'POST' && parts[0] === 'finalize') return json(await finalizeDay(env, force));
    if (request.method === 'POST' && parts[0] === 'recount') { await recount(env.DB); await bumpVersion(env.DB); return json({ ok: true }); }
    if (request.method === 'POST' && parts[0] === 'sitemaps') return json(await rebuildSitemaps(env.DB));
    return json({ error: 'not found' }, 404);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const r = await tick(env);
    console.log(JSON.stringify({ event: 'cron.done', ...r }));
  },
};

declare interface ScheduledController { cron: string }
