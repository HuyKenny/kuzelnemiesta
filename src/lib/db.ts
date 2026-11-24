// Read model over D1. Every page is 1–2 db.batch() round trips; the category tree (~250 rows), cities and stores are
// memoised per isolate for a minute, so breadcrumbs, chips and card labels never hit D1 again.
import { PER_PAGE, POSTS_PER_PAGE } from './site';

export interface Cat {
  id: number; slug: string; name: string; parent: number; count_total: number; count_direct: number; noindex: number; canon_id: number; image: string;
  icon: string; grp: string; short: string; sort: number;
}
export interface CatFull extends Cat { description_html: string; seo_title: string; seo_desc: string; seo_robots: string; body_html: string; faq_json: string }
export interface Card {
  id: number; slug: string; name: string; image: string; price: number; price_old: number; disc_pct: number; store_id: number; city: string;
  rating: number; reviews: number; deal_end: string | null; bought: number | null; created_at: string;
  /** country of the offer (Zlavomat COUNTRY_ID, ISO alpha-3) */
  cc?: string | null;
  /** number of variants (the price is "od") */
  nv?: number | null;
}
export interface Product extends Card {
  source: string; active: number; images: string; lok_id: number; excerpt: string; info: string; legacy_html: string; cat_ids: string;
  primary_cat: number; updated_at: string; expired_at: string; noindex: number; seo_title: string; seo_desc: string; target_url: string;
}
export interface Post {
  id: number; type: 'post' | 'page'; slug: string; title: string; content_html: string; excerpt: string; published_at: string; modified_at: string;
  cat_id: number; image: string; image_card: string; image_alt: string; image_w: number; image_h: number; author: string; noindex: number;
  seo_title: string; seo_desc: string; seo_robots: string; canonical: string; offers_cat: string; ld_json: string;
}
export type PostCard = Pick<Post, 'id' | 'slug' | 'title' | 'excerpt' | 'published_at' | 'image' | 'image_card' | 'image_alt' | 'cat_id'>;
export interface Lok { id: number; slug: string; name: string; count: number }
export interface Store { id: number; slug: string; name: string; description_html: string; count: number }

export const CARD = "p.id, p.slug, p.name, p.image, p.price, p.price_old, p.disc_pct, p.store_id, p.city, p.rating, p.reviews, json_extract(p.info, '$.de') AS deal_end, json_extract(p.info, '$.cu') AS bought, p.created_at, json_extract(p.info, '$.cc') AS cc, json_array_length(p.info, '$.va') AS nv";

let memo: { at: number; byId: Map<number, Cat>; bySlug: Map<string, Cat>; kids: Map<number, Cat[]>; loks: Map<number, Lok>; lokBySlug: Map<string, Lok>; stores: Map<number, Store> } | null = null;
export async function tree(db: D1Database) {
  if (memo && Date.now() - memo.at < 60_000) return memo;
  const [c, l, s] = await db.batch([
    db.prepare('SELECT id, slug, name, parent, count_total, count_direct, noindex, canon_id, image, icon, grp, short, sort FROM categories ORDER BY sort'),
    db.prepare('SELECT id, slug, name, count FROM lokality'),
    db.prepare('SELECT id, slug, name, description_html, count FROM stores'),
  ]);
  const rows = c!.results as Cat[];
  const kids = new Map<number, Cat[]>();
  for (const x of rows) (kids.get(x.parent) ?? kids.set(x.parent, []).get(x.parent)!).push(x);
  const loks = l!.results as Lok[];
  memo = {
    at: Date.now(), byId: new Map(rows.map((x) => [x.id, x])), bySlug: new Map(rows.map((x) => [x.slug, x])), kids,
    loks: new Map(loks.map((x) => [x.id, x])), lokBySlug: new Map(loks.map((x) => [x.slug, x])), stores: new Map((s!.results as Store[]).map((x) => [x.id, x])),
  };
  return memo;
}
export type Tree = Awaited<ReturnType<typeof tree>>;

/** Root → … → cat (inclusive). */
export function ancestry(t: Tree, id: number): Cat[] {
  const out: Cat[] = [];
  const seen = new Set<number>();
  let c = t.byId.get(id);
  while (c && !seen.has(c.id)) { out.unshift(c); seen.add(c.id); c = t.byId.get(c.parent); }
  return out;
}

export async function resolveSlug(db: D1Database, slug: string): Promise<{ kind: string; ref_id: number } | null> {
  return db.prepare('SELECT kind, ref_id FROM slugs WHERE slug = ?').bind(slug).first();
}

/** Unknown slug → a page only when the match is unambiguous: exactly one slug continues it with "-" and the requested
 *  slug is at least half of it (a cut-off URL, WordPress redirect_guess_404_permalink). */
export async function guessSlug(db: D1Database, slug: string): Promise<string | null> {
  if (slug.length < 8) return null;
  const rows = (await db.prepare("SELECT slug FROM slugs WHERE slug > ? AND slug < ? ORDER BY slug LIMIT 2").bind(slug + '-', slug + '-\uffff').all<{ slug: string }>()).results;
  return rows.length === 1 && slug.length >= rows[0]!.slug.length * 0.5 ? rows[0]!.slug : null;
}

export type Sort = 'pop' | 'price' | 'price-desc' | 'date' | 'disc';
export interface ListQuery { page: number; sort: Sort; min?: number | undefined; max?: number | undefined; store?: number | undefined; lok?: number | undefined; /** every row, no LIMIT (static data files, lib/staticdata.ts) */ all?: boolean | undefined }

function order(s: Sort, t: string): string {
  switch (s) {
    case 'price': return `${t}.price ASC, ${t}.created_at DESC`;
    case 'price-desc': return `${t}.price DESC, ${t}.created_at DESC`;
    case 'disc': return `${t}.disc DESC, ${t}.pop DESC`;
    case 'pop': return `${t}.mix DESC, ${t}.pop DESC, ${t}.created_at DESC`;
    default: return `${t}.created_at DESC, ${t}.product_id DESC`;
  }
}

/** Active offers of a category (incl. children, like WooCommerce), optionally of one city/store, one page + total. */
export async function listCategory(db: D1Database, catId: number, q: ListQuery): Promise<{ items: Card[]; total: number }> {
  const w = ['x.cat_id = ?'];
  const b: unknown[] = [catId];
  if (q.lok) { w.push('x.lok_id = ?'); b.push(q.lok); }
  if (q.min !== undefined) { w.push('x.price >= ?'); b.push(q.min); }
  if (q.max !== undefined) { w.push('x.price <= ?'); b.push(q.max); }
  if (q.store) { w.push('p.store_id = ?'); b.push(q.store); }
  const where = w.join(' AND ');
  const join = q.store ? 'JOIN products p ON p.id = x.product_id' : '';
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${CARD} FROM cat_products x JOIN products p ON p.id = x.product_id WHERE ${where} ORDER BY ${order(q.sort, 'x')}${q.all ? '' : ` LIMIT ${PER_PAGE} OFFSET ${(q.page - 1) * PER_PAGE}`}`).bind(...b),
    db.prepare(`SELECT COUNT(*) AS n FROM cat_products x ${join} WHERE ${where}`).bind(...b),
  ]);
  return { items: a!.results as Card[], total: Number((c!.results[0] as { n: number }).n) };
}

/** Active offers by city or store (no category). */
export async function listBy(db: D1Database, by: { lok?: number; store?: number }, q: ListQuery): Promise<{ items: Card[]; total: number }> {
  const w = ['p.active = 1'];
  const b: unknown[] = [];
  if (by.lok) { w.push('p.lok_id = ?'); b.push(by.lok); }
  if (by.store) { w.push('p.store_id = ?'); b.push(by.store); }
  if (q.min !== undefined) { w.push('p.price >= ?'); b.push(q.min); }
  if (q.max !== undefined) { w.push('p.price <= ?'); b.push(q.max); }
  const where = w.join(' AND ');
  const ord = q.sort === 'price' ? 'p.price ASC' : q.sort === 'price-desc' ? 'p.price DESC' : q.sort === 'disc' ? 'p.disc_pct DESC, p.pop DESC' : q.sort === 'pop' ? 'p.mix DESC, p.pop DESC, p.created_at DESC' : 'p.created_at DESC';
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${CARD} FROM products p WHERE ${where} ORDER BY ${ord}, p.id DESC${q.all ? '' : ` LIMIT ${PER_PAGE} OFFSET ${(q.page - 1) * PER_PAGE}`}`).bind(...b),
    db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${where}`).bind(...b),
  ]);
  return { items: a!.results as Card[], total: Number((c!.results[0] as { n: number }).n) };
}

/** Gift landings (src/data/darky.json): active offers of a set of categories (with children) under a price cap. */
export async function listGift(db: D1Database, catIds: number[], q: ListQuery & { cap?: number | undefined }): Promise<{ items: Card[]; total: number }> {
  const w = ['p.active = 1'];
  const b: unknown[] = [];
  if (catIds.length) { w.push(`EXISTS (SELECT 1 FROM cat_products x WHERE x.product_id = p.id AND x.cat_id IN (${catIds.map(() => '?').join(',')}))`); b.push(...catIds); }
  const max = Math.min(q.max ?? Infinity, q.cap ?? Infinity);
  if (Number.isFinite(max)) { w.push('p.price <= ?'); b.push(max); }
  if (q.min !== undefined) { w.push('p.price >= ?'); b.push(q.min); }
  if (q.store) { w.push('p.store_id = ?'); b.push(q.store); }
  w.push("p.image <> ''");
  const where = w.join(' AND ');
  const ord = q.sort === 'price' ? 'p.price ASC' : q.sort === 'price-desc' ? 'p.price DESC' : q.sort === 'disc' ? 'p.disc_pct DESC, p.pop DESC' : q.sort === 'date' ? 'p.created_at DESC' : 'p.mix DESC, p.pop DESC';
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${CARD} FROM products p WHERE ${where} ORDER BY ${ord}, p.id DESC${q.all ? '' : ` LIMIT ${PER_PAGE} OFFSET ${(q.page - 1) * PER_PAGE}`}`).bind(...b),
    db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${where}`).bind(...b),
  ]);
  return { items: a!.results as Card[], total: Number((c!.results[0] as { n: number }).n) };
}

/** Lowest price among active offers of a category (titles "od X €"; prices under 2 € are feed junk). */
export async function minPrice(db: D1Database, catId: number): Promise<number> {
  return (await db.prepare('SELECT MIN(price) AS m FROM cat_products WHERE cat_id = ? AND price >= 2').bind(catId).first<{ m: number | null }>())?.m ?? 0;
}

/** Offers ending soonest (Zlavomat deal_end within 10 days). */
export async function endingSoon(db: D1Database, n = 8): Promise<Card[]> {
  return (await db.prepare(`SELECT ${CARD} FROM products p WHERE p.active = 1 AND p.image <> '' AND json_extract(p.info, '$.de') BETWEEN date('now') AND date('now', '+10 days')
    ORDER BY p.mix DESC LIMIT ?`).bind(n).all<Card>()).results;
}
export async function biggestDiscounts(db: D1Database, n = 8): Promise<Card[]> {
  return (await db.prepare(`SELECT ${CARD} FROM products p WHERE p.active = 1 AND p.image <> '' AND p.disc_pct BETWEEN 30 AND 90 ORDER BY p.mix DESC, p.disc_pct DESC LIMIT ?`).bind(n).all<Card>()).results;
}

export async function loadCategory(db: D1Database, id: number): Promise<CatFull | null> {
  return db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<CatFull>();
}
export async function loadProduct(db: D1Database, id: number): Promise<Product | null> {
  return db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<Product>();
}

/** Similar active offers: same category, the most popular first. */
export async function similar(db: D1Database, catId: number, exclude: number, n = 8, lok = 0): Promise<Card[]> {
  if (!catId) return [];
  const lokFirst = lok ? `(x.lok_id = ${Number(lok)}) DESC, ` : '';
  return (await db.prepare(`SELECT ${CARD} FROM cat_products x JOIN products p ON p.id = x.product_id WHERE x.cat_id = ? AND x.product_id <> ? ORDER BY ${lokFirst}x.mix DESC, x.pop DESC, x.created_at DESC LIMIT ?`)
    .bind(catId, exclude, n).all<Card>()).results;
}

/** Offer boxes in articles: 30 newest offers of a category, shuffled with a seed that changes every 6 hours. */
export async function boxOffers(db: D1Database, catId: number, seed: string): Promise<Card[]> {
  const rows = (await db.prepare(`SELECT ${CARD} FROM cat_products x JOIN products p ON p.id = x.product_id WHERE x.cat_id = ? ORDER BY x.created_at DESC LIMIT 30`).bind(catId).all<Card>()).results;
  let h = 0;
  for (const ch of seed) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) | 0; return ((h >>> 0) % 10000) / 10000; };
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j]!, rows[i]!]; }
  return rows.slice(0, 9);
}

/** Home "Najpredávanejšie teraz": partners mixed, only gift-sized prices (a 2 300 € jet flight is no bestseller). */
export async function popular(db: D1Database, n = 8): Promise<Card[]> {
  return (await db.prepare(`SELECT ${CARD} FROM products p WHERE p.active = 1 AND p.image <> '' AND p.price BETWEEN 6 AND 250 ORDER BY p.mix DESC, p.pop DESC LIMIT ?`).bind(n).all<Card>()).results;
}

export async function loadPost(db: D1Database, id: number): Promise<Post | null> {
  return db.prepare("SELECT * FROM posts WHERE id = ? AND status = 'publish'").bind(id).first<Post>();
}
const POST_CARD = 'id, slug, title, excerpt, published_at, image, image_card, image_alt, cat_id';
export async function listPosts(db: D1Database, page: number, catId?: number): Promise<{ items: PostCard[]; total: number }> {
  const where = "type = 'post' AND status = 'publish'" + (catId ? ' AND cat_id = ?' : '');
  const b = catId ? [catId] : [];
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${POST_CARD} FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ${POSTS_PER_PAGE} OFFSET ${(page - 1) * POSTS_PER_PAGE}`).bind(...b),
    db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`).bind(...b),
  ]);
  return { items: a!.results as PostCard[], total: Number((c!.results[0] as { n: number }).n) };
}
export async function latestPosts(db: D1Database, n = 3, exclude = 0, catId = 0): Promise<PostCard[]> {
  return (await db.prepare(`SELECT ${POST_CARD} FROM posts WHERE type = 'post' AND status = 'publish' AND noindex = 0 AND id <> ? ${catId ? 'AND cat_id = ?' : ''} ORDER BY published_at DESC LIMIT ?`)
    .bind(...[exclude, ...(catId ? [catId] : []), n]).all<PostCard>()).results;
}
export async function postCat(db: D1Database, id: number) {
  return db.prepare('SELECT * FROM post_categories WHERE id = ?').bind(id).first<{ id: number; slug: string; name: string; description: string; count: number }>();
}

/** FTS5 offer search (name + city), diacritics-insensitive, prefix match on every term; active offers only. */
export async function search(db: D1Database, query: string, page: number): Promise<{ items: Card[]; total: number }> {
  const terms = query.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1).slice(0, 6);
  if (!terms.length) return { items: [], total: 0 };
  const match = terms.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${CARD} FROM product_fts f JOIN products p ON p.id = f.rowid WHERE product_fts MATCH ? AND p.active = 1 ORDER BY f.rank LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`).bind(match),
    db.prepare('SELECT COUNT(*) AS n FROM product_fts f JOIN products p ON p.id = f.rowid WHERE product_fts MATCH ? AND p.active = 1').bind(match),
  ]);
  return { items: a!.results as Card[], total: Number((c!.results[0] as { n: number }).n) };
}

export async function siteCache(db: D1Database, key: string): Promise<string | null> {
  return (await db.prepare('SELECT value FROM site_cache WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
}
let comboMemo: { at: number; map: Record<string, Record<string, number>> } | null = null;
/** Category × city offer counts (nightly, finalizeDay). */
export async function combos(db: D1Database): Promise<Record<string, Record<string, number>>> {
  if (comboMemo && Date.now() - comboMemo.at < 300_000) return comboMemo.map;
  let map: Record<string, Record<string, number>> = {};
  try { map = JSON.parse((await siteCache(db, 'combos')) ?? '{}'); } catch { /* empty */ }
  comboMemo = { at: Date.now(), map };
  return map;
}
