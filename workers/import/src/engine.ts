// One feed per run: download → stream-parse → create/refresh/expire offers → category membership → counts.
// Replaces the four WP All Import imports of WordPress (30. 10. 2026). finalizeDay() once a day: popularity, combo
// counts, category photos, sitemaps, data_version.
import { decodeXmlStream, parseXmlItems, XmlError } from './xml/stream';
import { FEEDS, type FeedDef } from './feeds';
import { finishVariants, itemHash, mergeVariants, parseItem, type Item } from './parse';
import { openFeed, FeedFetchError } from './http';
import { seriesCats } from './classify';
import { rebuildSitemaps } from '../../../src/lib/sitemap';
import { cityName } from '../../../src/lib/cities';

export interface Env {
  DB: D1Database;
  IMPORT_SHARED_SECRET?: string;
  ALLOWED_FEED_HOSTS?: string;
  MAX_DROP_PCT?: string;
  MAX_WRITES?: string;
  [k: string]: unknown; // FEED_URL_*
}
export interface RunResult {
  feed: string; status: 'ok' | 'partial' | 'skipped' | 'error' | 'suspicious';
  read: number; created: number; changed: number; expired: number; revived: number; message?: string; ms: number;
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));

/** WordPress sanitize_title(): accents off, lower case, everything but [a-z0-9 _-] dropped, spaces → dashes. */
export function wpSlug(t: string): string {
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/\./g, '-')
    .replace(/[^a-z0-9\s_-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 190).replace(/-+$/, '') || 'nabidka';
}

async function inBatches(db: D1Database, stmts: D1PreparedStatement[], size = 50) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

interface CatRow { id: number; slug: string; name: string; parent: number; count_total: number }
interface Ctx {
  db: D1Database;
  cats: Map<number, CatRow>;
  /** feed category path "<root>|<child>" (lower case) → category (cat_alias, scripts/taxonomie-apply.py) */
  alias: Map<string, number>;
  unmapped: Set<string>;
  bySlug: Map<string, number>;
  slugs: Set<string>;
  newStmts: D1PreparedStatement[];
  loks: Map<string, number>;
  nextLok: number;
}

async function context(db: D1Database): Promise<Ctx> {
  const [c, s, l, mx, al] = await db.batch([
    db.prepare('SELECT id, slug, name, parent, count_total FROM categories'),
    db.prepare('SELECT slug FROM slugs'),
    db.prepare('SELECT id, slug FROM lokality'),
    db.prepare('SELECT COALESCE(MAX(id), 0) AS c, (SELECT COALESCE(MAX(id), 0) FROM lokality) AS l FROM categories'),
    db.prepare('SELECT feed_key, cat_id FROM cat_alias'),
  ]);
  const cats = new Map((c!.results as CatRow[]).map((r) => [r.id, r]));
  const m = mx!.results[0] as { c: number; l: number };
  return {
    db, cats, bySlug: new Map((c!.results as CatRow[]).map((r) => [r.slug, r.id])), slugs: new Set((s!.results as Array<{ slug: string }>).map((r) => r.slug)), unmapped: new Set(),
    alias: new Map((al!.results as Array<{ feed_key: string; cat_id: number }>).map((r) => [r.feed_key, r.cat_id])), newStmts: [], loks: new Map((l!.results as Array<{ id: number; slug: string }>).map((r) => [r.slug, r.id])), nextLok: m.l + 1,
  };
}

function uniqueSlug(ctx: Ctx, base: string): string {
  let s = base, n = 2;
  while (ctx.slugs.has(s)) s = `${base}-${n++}`;
  ctx.slugs.add(s);
  return s;
}

/** Feed category path → categories of the new tree (redesign v2): the root by "|<name>", each child by "<root>|<name>"
 *  through cat_alias. A name the tree does not know yet goes to the root's section and is reported (GET /status,
 *  site_cache 'cat:unmapped') — new public categories are no longer created automatically. */
function resolveCats(ctx: Ctx, path: string[]): number[] {
  const out: number[] = [];
  // "@slug" entries (classifier, geography): categories of the tree by slug — alone or next to feed category names
  const slugs = path.filter((x) => x.startsWith('@'));
  const named = path.filter((x) => !x.startsWith('@'));
  const bySlug = () => { for (const s of slugs) { const id = ctx.bySlug.get(s.slice(1)); if (id && !out.includes(id)) out.push(id); else if (!id) ctx.unmapped.add(s); } };
  if (!named.length) { bySlug(); return out; }
  path = named;
  const rootName = (path[0] ?? '').trim().toLowerCase();
  const root = ctx.alias.get('|' + rootName);
  if (!root) { if (rootName) ctx.unmapped.add('|' + rootName); return out; }
  out.push(root);
  for (const raw of path.slice(1)) {
    const key = rootName + '|' + raw.trim().toLowerCase();
    const id = ctx.alias.get(key);
    if (id) { if (!out.includes(id)) out.push(id); } else if (raw.trim()) ctx.unmapped.add(key);
  }
  bySlug();
  // the section alone when a more specific category exists adds nothing (it is an ancestor anyway)
  return out.length > 1 ? out.filter((id) => !(id === root && out.some((o) => o !== root && ancestors(ctx, o).includes(root)))) : out;
}

function lokId(ctx: Ctx, slug: string): number {
  if (!slug) return 0;
  let id = ctx.loks.get(slug);
  if (!id) {
    id = ctx.nextLok++;
    ctx.loks.set(slug, id);
    ctx.newStmts.push(ctx.db.prepare('INSERT OR IGNORE INTO lokality (id, slug, name) VALUES (?, ?, ?)').bind(id, slug, cityName(slug).nom));
  }
  return id;
}

function ancestors(ctx: Ctx, id: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  let c = ctx.cats.get(id);
  while (c && !seen.has(c.id)) { out.push(c.id); seen.add(c.id); c = ctx.cats.get(c.parent); }
  return out;
}

/** The most specific category: deepest, then the smallest (more specific). Keeps the current one while still assigned. */
function primaryOf(ctx: Ctx, ids: number[], current = 0): number {
  if (current && ids.includes(current)) return current;
  let best = 0, bd = -1, bc = Infinity;
  for (const id of ids) {
    const d = ancestors(ctx, id).length, c = ctx.cats.get(id)?.count_total ?? 0;
    if (d > bd || (d === bd && c < bc)) { best = id; bd = d; bc = c; }
  }
  return best;
}

interface Existing { id: number; ext_id: string; slug: string; content_hash: string; active: number; cat_ids: string; primary_cat: number; created_at: string; pop: number }

/** cat_products rows of one active offer (every ancestor of every direct category). */
function memberStmts(ctx: Ctx, pid: number, created: string, catIds: number[], price: number, disc: number, pop: number, lok: number): D1PreparedStatement[] {
  const all = new Map<number, number>();
  for (const c of catIds) for (const a of ancestors(ctx, c)) all.set(a, Math.max(all.get(a) ?? 0, a === c ? 1 : 0));
  const rows = [...all.entries()];
  const out: D1PreparedStatement[] = [ctx.db.prepare('DELETE FROM cat_products WHERE product_id = ?').bind(pid)];
  // D1: at most 100 bound parameters per statement → 12 rows of 8
  for (let i = 0; i < rows.length; i += 12) {
    const part = rows.slice(i, i + 12);
    out.push(ctx.db.prepare(`INSERT OR REPLACE INTO cat_products (cat_id, created_at, product_id, direct, price, disc, pop, lok_id) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`)
      .bind(...part.flatMap(([c, d]) => [c, created, pid, d, price, disc, pop, lok])));
  }
  return out;
}

async function feedState(db: D1Database, key: string) {
  return db.prepare('SELECT * FROM feed_state WHERE feed = ?').bind(key).first<{ etag: string | null; last_modified: string | null; last_ok_at: string | null; last_status: string | null }>();
}

export async function runFeed(env: Env, f: FeedDef, opts: { force?: boolean; items?: Map<string, Item> } = {}): Promise<RunResult> {
  const t0 = Date.now();
  const db = env.DB;
  const res: RunResult = { feed: f.key, status: 'ok', read: 0, created: 0, changed: 0, expired: 0, revived: 0, ms: 0 };
  const started = new Date().toISOString();
  const st = await feedState(db, f.key);
  await db.prepare('INSERT INTO feed_state (feed, last_run_at) VALUES (?, ?) ON CONFLICT(feed) DO UPDATE SET last_run_at = excluded.last_run_at').bind(f.key, now()).run();
  const finish = async (status: RunResult['status'], message = '', meta?: { etag: string | null; lastModified: string | null }) => {
    res.status = status; res.ms = Date.now() - t0;
    if (message) res.message = message;
    await db.prepare('INSERT INTO import_runs (feed, started_at, finished_at, status, read, created, changed, expired, revived, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(f.key, started, new Date().toISOString(), status, res.read, res.created, res.changed, res.expired, res.revived, message.slice(0, 300)).run();
    const ok = status === 'ok';
    await db.prepare(`UPDATE feed_state SET last_status = ?, last_message = ?, items = CASE WHEN ? THEN ? ELSE items END,
        last_ok_at = CASE WHEN ? THEN ? ELSE last_ok_at END, etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified),
        active = (SELECT COUNT(*) FROM products WHERE source = ? AND active = 1) WHERE feed = ?`)
      .bind(status, message.slice(0, 300) || null, ok ? 1 : 0, res.read, ok ? 1 : 0, now(), meta?.etag ?? null, meta?.lastModified ?? null, f.key, f.key).run();
    log('feed.done', { ...res });
    return res;
  };
  const url = String(env[f.secret] ?? '');
  if (!url && !opts.items) return finish('skipped', `no ${f.secret} secret`);

  // 1. download + parse the whole feed (bounded: one item at a time; ~8k items × ~1.5 kB)
  const items = new Map<string, Item>();
  let meta: { etag: string | null; lastModified: string | null } = { etag: null, lastModified: null };
  try {
    if (opts.items) { for (const [k, v] of opts.items) items.set(k, v); } else {
    const opened = await openFeed(url, env.ALLOWED_FEED_HOSTS, opts.force ? {} : { etag: st?.etag, lastModified: st?.last_modified });
    if (opened.status === 'not_modified') {
      await db.prepare("UPDATE products SET seen_at = ? WHERE source = ? AND active = 1").bind(now(), f.key).run();
      return finish('ok', 'not modified');
    }
    meta = { etag: opened.etag, lastModified: opened.lastModified };
    for await (const node of parseXmlItems(decodeXmlStream(opened.body, { maxBytes: 300_000_000 }), f.item)) {
      res.read++;
      const it = parseItem(f.key, node);
      if (!it) continue;
      const prev = items.get(it.ext);
      // Adrop lists one row per variant (same ITEMGROUP_ID): the cheapest is the offer ("od X Kč"), all of them its variants
      items.set(it.ext, prev ? mergeVariants(prev, it) : it);
    }
    for (const it of items.values()) finishVariants(it);
    }
  } catch (e) {
    const msg = e instanceof FeedFetchError || e instanceof XmlError ? e.message : String(e);
    return finish('error', msg);
  }
  if (!items.size) return finish('error', 'feed has no usable items');

  // 2. compare with the catalogue
  const ctx = await context(db);
  const existing = new Map<string, Existing>();
  for (const r of (await db.prepare('SELECT id, ext_id, slug, content_hash, active, cat_ids, primary_cat, created_at, pop FROM products WHERE source = ?').bind(f.key).all<Existing>()).results) existing.set(r.ext_id, r);
  const activeBefore = [...existing.values()].filter((r) => r.active).length;
  const gone = [...existing.values()].filter((r) => r.active && !items.has(r.ext_id));
  const maxDrop = Number(env.MAX_DROP_PCT ?? 40);
  if (activeBefore > 50 && gone.length / activeBefore * 100 > maxDrop && !opts.force) {
    return finish('suspicious', `${gone.length} of ${activeBefore} offers missing (> ${maxDrop} %) — nothing changed`, meta);
  }
  const storeId = (await db.prepare('SELECT id FROM stores WHERE slug = ?').bind(f.store).first<{ id: number }>())?.id ?? 0;
  let nextId = ((await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM products').first<{ m: number }>())?.m ?? 0) + 1;
  const maxWrites = Number(env.MAX_WRITES ?? 2500);
  const stamp = now();
  const stmts: D1PreparedStatement[] = [];
  let writes = 0, capped = false;
  for (const it of items.values()) {
    const hash = itemHash(it);
    const ex = existing.get(it.ext);
    if (ex && ex.active && ex.content_hash === hash) continue;
    if (writes >= maxWrites) { capped = true; break; }
    writes++;
    const feedCats = resolveCats(ctx, [...it.cats, ...seriesCats(it.name)]);
    const disc = it.priceOld > it.price ? Math.round((it.priceOld - it.price) / it.priceOld * 100) : 0;
    const lok = lokId(ctx, it.lok);
    const city = it.lok ? (it.city || cityName(it.lok).nom) : '';
    const info = JSON.stringify(it.info);
    if (ex) {
      // keep categories added on WordPress by hand (WPAI only ever added terms)
      let old: number[] = [];
      try { old = JSON.parse(ex.cat_ids) as number[]; } catch { /* none */ }
      const catIds = [...new Set([...old.filter((c) => ctx.cats.has(c)), ...feedCats])];
      const primary = primaryOf(ctx, catIds, ex.primary_cat);
      stmts.push(db.prepare(`UPDATE products SET name = ?, store_id = ?, active = 1, price = ?, price_old = ?, disc_pct = ?, target_url = ?, image = ?, images = ?,
          lok_id = ?, city = ?, excerpt = ?, info = ?, cat_ids = ?, primary_cat = ?, rating = ?, reviews = ?, updated_at = ?, seen_at = ?, expired_at = '', content_hash = ? WHERE id = ?`)
        .bind(it.name, storeId, it.price, it.priceOld, disc, it.target, it.image, JSON.stringify(it.images), lok, city, it.excerpt, info, JSON.stringify(catIds), primary,
          it.rating, it.reviews, stamp, stamp, hash, ex.id));
      stmts.push(...memberStmts(ctx, ex.id, ex.created_at, catIds, it.price, disc, ex.pop, lok));
      stmts.push(db.prepare('DELETE FROM product_fts WHERE rowid = ?').bind(ex.id), db.prepare('INSERT INTO product_fts (rowid, name, city) VALUES (?, ?, ?)').bind(ex.id, it.name, city));
      if (ex.active) res.changed++; else res.revived++;
    } else {
      const id = nextId++;
      const slug = uniqueSlug(ctx, wpSlug(it.name));
      const primary = primaryOf(ctx, feedCats);
      stmts.push(db.prepare(`INSERT INTO products (id, slug, name, source, ext_id, store_id, active, price, price_old, disc_pct, target_url, image, images, lok_id, city,
          excerpt, info, cat_ids, primary_cat, rating, reviews, created_at, updated_at, seen_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, slug, it.name, f.key, it.ext, storeId, it.price, it.priceOld, disc, it.target, it.image, JSON.stringify(it.images), lok, city, it.excerpt, info,
          JSON.stringify(feedCats), primary, it.rating, it.reviews, stamp, stamp, stamp, hash));
      stmts.push(db.prepare("INSERT OR IGNORE INTO slugs (slug, kind, ref_id) VALUES (?, 'product', ?)").bind(slug, id));
      stmts.push(...memberStmts(ctx, id, stamp, feedCats, it.price, disc, 0, lok));
      stmts.push(db.prepare('INSERT INTO product_fts (rowid, name, city) VALUES (?, ?, ?)').bind(id, it.name, city));
      res.created++;
    }
  }
  // 3. offers that left the feed: page stays ("skončila", noindex), out of every listing
  for (const g of gone) {
    stmts.push(db.prepare("UPDATE products SET active = 0, expired_at = ? WHERE id = ?").bind(stamp, g.id), db.prepare('DELETE FROM cat_products WHERE product_id = ?').bind(g.id));
    res.expired++;
  }
  await inBatches(db, [...ctx.newStmts, ...stmts]);
  await db.prepare('UPDATE products SET seen_at = ? WHERE source = ? AND active = 1').bind(stamp, f.key).run();
  await recount(db);
  await bumpVersion(db);
  if (ctx.unmapped.size) {
    const prev = await db.prepare("SELECT value FROM site_cache WHERE key = 'cat:unmapped'").first<{ value: string }>();
    const all = [...new Set([...(prev ? JSON.parse(prev.value) as string[] : []), ...ctx.unmapped])].slice(0, 300);
    await db.prepare("INSERT INTO site_cache (key, value, updated_at) VALUES ('cat:unmapped', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(all), stamp).run();
    log('categories.unmapped', { feed: f.key, keys: [...ctx.unmapped].slice(0, 20) });
  }
  return finish(capped ? 'partial' : 'ok', capped ? `write cap ${maxWrites} reached — continues next run` : '', capped ? undefined : meta);
}

/** Offer counts of categories, cities and stores (drive titles, H2, tiles and the noindex of thin listings). */
export async function recount(db: D1Database) {
  await db.batch([
    db.prepare(`UPDATE categories SET count_total = (SELECT COUNT(*) FROM cat_products x WHERE x.cat_id = categories.id),
        count_direct = (SELECT COUNT(*) FROM cat_products x WHERE x.cat_id = categories.id AND x.direct = 1)`),
    db.prepare('UPDATE lokality SET count = (SELECT COUNT(*) FROM products p WHERE p.lok_id = lokality.id AND p.active = 1)'),
    db.prepare('UPDATE stores SET count = (SELECT COUNT(*) FROM products p WHERE p.store_id = stores.id AND p.active = 1)'),
  ]);
}

export async function bumpVersion(db: D1Database) {
  const v = new Date().toISOString();
  await db.prepare("INSERT INTO site_cache (key, value, updated_at) VALUES ('data_version', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(v, v).run();
}

/** Next feed to run: a partial run continues at once, otherwise the feed whose last run is the oldest past its interval. */
export async function nextDueFeed(db: D1Database): Promise<FeedDef | null> {
  const rows = new Map((await db.prepare('SELECT feed, last_run_at, last_status FROM feed_state').all<{ feed: string; last_run_at: string | null; last_status: string | null }>()).results.map((r) => [r.feed, r]));
  let best: FeedDef | null = null, bestAge = -1;
  for (const f of FEEDS) {
    if (!f.secret) continue; // pushed from outside (/ingest)
    const r = rows.get(f.key);
    if (r?.last_status === 'partial') return f;
    const age = r?.last_run_at ? (Date.now() - Date.parse(r.last_run_at.replace(' ', 'T') + 'Z')) / 3600_000 : 1e9;
    if (age >= f.everyH && age > bestAge) { best = f; bestAge = age; }
  }
  return best;
}

/** Default order that sells every partner: inside each partner (and category) offers are ranked by popularity, the rank is
 *  divided by √(partner size) and everything is sorted by that → Slevomat's thousands do not bury Adrop's hundreds, yet
 *  a bigger partner still gets proportionally more places. Offers without a photo go last of their partner. */
export async function remix(db: D1Database) {
  // The best offers of the category go first, whoever sells them. The key of an offer is half its rank in the category and
  // half its rank among the offers of the same partner (so every partner's best sits near the top of its share), damped
  // by how many better offers of the same partner there are: key = k / (1 + 0.1 · n). No photo → key halved.
  await db.batch([
    db.prepare(`UPDATE products SET mix = CAST(r.k * 1000000 AS INTEGER) FROM (SELECT t.id AS id, t.k0 / (1 + 0.1 * ROW_NUMBER() OVER (PARTITION BY t.st ORDER BY t.k0 DESC)) AS k FROM
        (SELECT p.id AS id, p.store_id AS st, p.rank_score * (CASE WHEN p.image <> '' THEN 1.0 ELSE 0.5 END) AS k0 FROM products p WHERE p.active = 1) t) r WHERE products.id = r.id`),
    db.prepare(`UPDATE cat_products SET mix = CAST(r.k * 1000000 AS INTEGER) FROM (SELECT t.c AS c, t.t AS t, t.i AS i, t.k0 / (1 + 0.1 * ROW_NUMBER() OVER (PARTITION BY t.c, t.st ORDER BY t.k0 DESC)) AS k FROM
        (SELECT x.cat_id AS c, x.created_at AS t, x.product_id AS i, p.store_id AS st,
           (0.5 * x.rank + 0.5 * PERCENT_RANK() OVER (PARTITION BY x.cat_id, p.store_id ORDER BY x.rank)) * (CASE WHEN p.image <> '' THEN 1.0 ELSE 0.5 END) AS k0
         FROM cat_products x JOIN products p ON p.id = x.product_id) t) r
        WHERE cat_products.cat_id = r.c AND cat_products.created_at = r.t AND cat_products.product_id = r.i`),
  ]);
}

/** Impressions of products: every counted view of a listing page (list_views, middleware) shows the 24 cards that were
 *  on that page at that moment — the order is still yesterday's here, which is what the visitors saw. Each day is
 *  processed once (site_cache 'rank:impr_day'). */
async function addImpressions(db: D1Database) {
  const last = (await db.prepare("SELECT value FROM site_cache WHERE key = 'rank:impr_day'").first<{ value: string }>())?.value ?? '0000-00-00';
  const today = new Date().toISOString().slice(0, 10);
  const views = (await db.prepare('SELECT day, slug, page, n FROM list_views WHERE day > ? AND day < ?').bind(last, today).all<{ day: string; slug: string; page: number; n: number }>()).results;
  const stmts = views.map((v) => db.prepare(`INSERT OR REPLACE INTO impr_daily (day, cat_id, product_id, pos, n)
      SELECT ?, t.cat_id, t.product_id, ? + t.rn, ? FROM (SELECT x.cat_id, x.product_id, ROW_NUMBER() OVER (ORDER BY x.mix DESC, x.pop DESC, x.created_at DESC) AS rn
        FROM cat_products x JOIN categories c ON c.id = x.cat_id WHERE c.slug = ? ORDER BY x.mix DESC, x.pop DESC, x.created_at DESC LIMIT 24 OFFSET ?) t`)
    .bind(v.day, (v.page - 1) * 24, v.n, v.slug, (v.page - 1) * 24));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.batch([
    db.prepare("INSERT INTO site_cache (key, value, updated_at) VALUES ('rank:impr_day', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(new Date(Date.now() - 86400_000).toISOString().slice(0, 10), new Date().toISOString()),
    db.prepare("DELETE FROM impr_daily WHERE day < date('now', '-60 days')"),
    db.prepare("DELETE FROM list_views WHERE day < date('now', '-60 days')"),
  ]);
}

/** The "most likely to convert" score. Raw components 0..1 per product, then percentile within each category:
 *  rank = .35 sales + .30 clicks + .15 searches + .10 quality + .10 novelty/price (all weighted so that missing data is
 *  neutral, never a penalty). The click part learns: it needs ≥ 30 impressions and is fully trusted at 300. */
export async function computeRank(db: D1Database) {
  await addImpressions(db);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  await db.batch([
    db.prepare(`UPDATE products SET
      r_sales = 0.5 * (CASE WHEN rating > 0 THEN ((rating * reviews + 4.3 * 20) / (reviews + 20)) / 5.0 ELSE 0.5 END)
              + 0.5 * (CASE WHEN CAST(json_extract(info, '$.cu') AS REAL) > 0 THEN CAST(json_extract(info, '$.cu') AS REAL) / (CAST(json_extract(info, '$.cu') AS REAL) + 300.0) ELSE 0.4 END)
              + MIN(0.25, conv_30d * 0.05),
      r_search = search_impr * 1.0 / (search_impr + 50.0),
      r_qual = 0.4 * (image <> '') + 0.2 * (json_array_length(images) >= 2) + 0.2 * (length(COALESCE(json_extract(info, '$.d'), '')) > 150) + 0.2 * (rating > 0),
      r_new = MAX(CASE WHEN created_at > datetime('now', '-7 days') THEN 1.0 ELSE 0.0 END, CASE WHEN price BETWEEN 150 AND 6000 THEN 0.7 ELSE 0.4 END)
      WHERE active = 1`),
    db.prepare(`UPDATE products SET r_click = 0.5 * (1 - w.w) + w.w * MIN(1.0, ((w.k + 2.0) / (w.e + 100.0)) / 0.08)
      FROM (SELECT p.id AS id,
              COALESCE((SELECT SUM(n) FROM impr_daily d WHERE d.product_id = p.id AND d.day > date('now', '-30 days')), 0) AS imp,
              COALESCE((SELECT SUM(n * 1.0 / (1 + pos / 6.0)) FROM impr_daily d WHERE d.product_id = p.id AND d.day > date('now', '-30 days')), 0) AS e,
              (SELECT COUNT(*) FROM clicks c WHERE c.product_id = p.id AND c.clicked_at > ?) AS k,
              MIN(1.0, MAX(0.0, ((SELECT COALESCE(SUM(n), 0) FROM impr_daily d WHERE d.product_id = p.id AND d.day > date('now', '-30 days')) - 30) / 270.0)) AS w
            FROM products p WHERE p.active = 1) w WHERE products.id = w.id`).bind(since),
    db.prepare('UPDATE products SET rank_score = 0.35 * r_sales + 0.30 * r_click + 0.15 * r_search + 0.10 * r_qual + 0.10 * r_new WHERE active = 1'),
    db.prepare(`UPDATE cat_products SET rank = r.v FROM (SELECT x.cat_id AS c, x.created_at AS t, x.product_id AS i,
        0.35 * PERCENT_RANK() OVER (PARTITION BY x.cat_id ORDER BY p.r_sales) + 0.30 * PERCENT_RANK() OVER (PARTITION BY x.cat_id ORDER BY p.r_click)
        + 0.15 * PERCENT_RANK() OVER (PARTITION BY x.cat_id ORDER BY p.r_search) + 0.10 * PERCENT_RANK() OVER (PARTITION BY x.cat_id ORDER BY p.r_qual)
        + 0.10 * PERCENT_RANK() OVER (PARTITION BY x.cat_id ORDER BY p.r_new) AS v
        FROM cat_products x JOIN products p ON p.id = x.product_id) r WHERE cat_products.cat_id = r.c AND cat_products.created_at = r.t AND cat_products.product_id = r.i`),
  ]);
}

/** Once a day: popularity, combo counts, category photos, sitemaps, data_version. */
export async function finalizeDay(env: Env, force = false): Promise<Record<string, unknown>> {
  const db = env.DB;
  const day = new Date().toISOString().slice(0, 10);
  const done = await db.prepare("SELECT value FROM site_cache WHERE key = 'import:finalized'").first<{ value: string }>();
  if (done?.value === day && !force) return { skipped: 'already finalized today' };
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  // popularity = real clicks of the last 30 days (×50) + how many people bought it at the partner (capped)
  await db.batch([
    db.prepare(`UPDATE products SET pop = COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.product_id = products.id AND c.clicked_at > ?), 0) * 50
        + MIN(COALESCE(CAST(json_extract(info, '$.cu') AS INTEGER), 0), 5000) / 10 + COALESCE(CAST(json_extract(info, '$.pr') AS INTEGER), 0) WHERE active = 1`).bind(since),
    db.prepare('UPDATE cat_products SET pop = (SELECT p.pop FROM products p WHERE p.id = cat_products.product_id)'),
    // click log retention promised in the privacy policy (/ochrana-osobnich-udaju/): 24 months
    db.prepare("DELETE FROM clicks WHERE clicked_at < datetime('now', '-24 months')"),
  ]);
  await recount(db);
  await computeRank(db);
  await remix(db);
  // city × category counts (canonical + chips of /<kat>/lokalita/<mesto>/, KD_COMBO_MIN = 40)
  const combos = (await db.prepare('SELECT x.cat_id AS c, l.slug AS s, COUNT(*) AS n FROM cat_products x JOIN lokality l ON l.id = x.lok_id WHERE x.lok_id > 0 GROUP BY x.cat_id, x.lok_id')
    .all<{ c: number; s: string; n: number }>()).results;
  const map: Record<number, Record<string, number>> = {};
  for (const r of combos) (map[r.c] ??= {})[r.s] = r.n;
  // tile photo of each category = photo of its most popular offer
  await db.prepare(`UPDATE categories SET image = COALESCE((SELECT p.image FROM cat_products x JOIN products p ON p.id = x.product_id
      WHERE x.cat_id = categories.id AND p.image <> '' ORDER BY x.pop DESC, x.created_at DESC LIMIT 1), '')`).run();
  const sm = await rebuildSitemaps(db);
  const stamp = new Date().toISOString();
  const put = (k: string, v: string) => db.prepare('INSERT INTO site_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, stamp);
  await db.batch([put('combos', JSON.stringify(map)), put('import:finalized', day)]);
  await bumpVersion(db);
  return { combos: combos.length, sitemaps: sm };
}
