// Data files for the client-side listing sort/filters and the offer search (Cloudflare Workers Free, 24. 11. 2026). Every page
// is a static file now and Workers static assets ignore the query string, so ?orderby= / ?max_price= / ?partner= and /?s= are
// evaluated in the browser (src/scripts/staticky.ts). These endpoints run only in the nightly build (local SSR over the SQLite
// state, scripts/static/build.py): a listing page points at its file with data-src="/data/l/<base>.json" (zmraz.py follows it),
// the search page at /data/search.json, which build.py splits into /data/s/<xx>.json (two-letter word prefixes) + index.json.
import { CARD, tree, type Card } from './db';
import { dispatch } from './dispatch';
import { SORTS } from './filters';
import { decode, place } from './format';
import { card } from './img';
import { partner } from './partners';
import { categoryView, cityView, giftView, storeView } from './views';

/** Diacritics-insensitive form used by the search on both sides (same code in src/scripts/staticky.ts). */
export const fold = (t: string) => decode(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type Tree = Awaited<ReturnType<typeof tree>>;
/** Partners of the rows: [slug, name, colour, price per night]. */
class Stores {
  list: Array<[string, string, string, number]> = [];
  private map = new Map<number, number>();
  constructor(private t: Tree) {}
  id(storeId: number): number {
    let i = this.map.get(storeId);
    if (i === undefined) {
      const s = this.t.stores.get(storeId);
      const pt = partner(s?.slug);
      i = this.list.length;
      this.list.push([s?.slug ?? '', s ? decode(s.name) : '', pt.color, pt.unit ? 1 : 0]);
      this.map.set(storeId, i);
    }
    return i;
  }
}

/** Card = [id, slug, name, photo 1×, price, old price, discount %, partner index, place, rating, reviews, deal end, bought, created (unix s)]
 *  (components/Karta.astro; the badge is computed in the browser from the dates, as the SSR did per request). */
function cardRow(p: Card, st: Stores): unknown[] {
  const img = card(p.image, 360);
  return [p.id, p.slug, decode(p.name), img?.src ?? '', p.price, p.price_old, p.disc_pct, st.id(p.store_id), place(p.city, p.cc), p.rating, p.reviews,
    p.deal_end ?? '', p.bought ?? 0, Math.round(Date.parse(String(p.created_at).replace(' ', 'T') + 'Z') / 1000) || 0];
}
/** Common prefix/suffix of the photo URLs (wsrv.nl …&w=360&h=240&…) cut off the rows → ip; the browser puts them back. */
function packImages(rows: unknown[][], col: number): [string, string] {
  const urls = rows.map((r) => r[col] as string).filter(Boolean);
  if (!urls.length || !urls.every((u) => u.startsWith('https://'))) return ['', ''];
  let pre = urls[0]!, suf = urls[0]!;
  for (const u of urls) {
    while (!u.startsWith(pre)) pre = pre.slice(0, -1);
    while (!u.endsWith(suf)) suf = suf.slice(1);
  }
  pre = pre.slice(0, pre.lastIndexOf('=') + 1 || 0);
  suf = suf.slice(suf.indexOf('&') < 0 ? suf.length : suf.indexOf('&'));
  if (pre.length + suf.length < 12) return ['', ''];
  for (const r of rows) if (r[col]) r[col] = (r[col] as string).slice(pre.length, (r[col] as string).length - suf.length);
  return [pre, suf];
}

/**
 * One listing (any path the listing templates serve: section/category, category × city, city, partner, gift landing) rendered by
 * its own view with every row (?__all=1) once per sort → c: card rows in the default order, o: row order of every sort (the SQL of
 * lib/db.ts, so ties and the gift price cap match the old SSR), s: partners.
 */
export async function listingData(db: D1Database, path: string): Promise<unknown | null> {
  const r = await dispatch(db, `/${path}/`);
  const t = await tree(db);
  const st = new Stores(t);
  const rows: unknown[][] = [];
  const rowOf = new Map<number, number>();
  const order: Record<string, number[]> = {};
  for (const [s] of SORTS) {
    const sp = new URLSearchParams({ orderby: s, __all: '1' });
    const v = r.kind === 'category' ? await categoryView(db, r.id, 1, sp)
      : r.kind === 'combo' ? await categoryView(db, r.cat, 1, sp, r.city)
      : r.kind === 'gift' ? await giftView(db, r.id, 1, sp)
      : r.kind === 'city' ? await cityView(db, r.city, 1, sp)
      : r.kind === 'store' ? await storeView(db, r.store, 1, sp) : null;
    if (!v || 'redirect' in v) return null;
    order[s] = v.items.map((p) => {
      let i = rowOf.get(p.id);
      if (i === undefined) { i = rows.length; rowOf.set(p.id, i); rows.push(cardRow(p, st)); }
      return i;
    });
  }
  const ip = packImages(rows, 3);
  return { n: order.pop?.length ?? rows.length, s: st.list, ip, o: order, c: rows };
}

/** Search corpus: every active offer (name + place, folded) in the listing's default order, + categories for the suggestions. */
export async function searchData(db: D1Database): Promise<unknown> {
  const t = await tree(db);
  const st = new Stores(t);
  const res = await db.prepare(`SELECT ${CARD} FROM products p WHERE p.active = 1 ORDER BY p.mix DESC, p.pop DESC, p.id DESC`).all<Card>();
  const rows = res.results.map((p) => [fold(`${p.name} ${p.city ?? ''}`), ...cardRow(p, st)]);
  const ip = packImages(rows, 4);
  const cats = [...t.byId.values()].filter((c) => c.count_total > 0 && !c.noindex && !c.canon_id).sort((a, b) => b.count_total - a.count_total).map((c) => [decode(c.name), c.slug, c.count_total]);
  return { meta: { s: st.list, ip, cats }, rows };
}
