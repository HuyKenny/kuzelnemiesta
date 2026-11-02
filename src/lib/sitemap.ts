// Sitemaps with the Rank Math file names Google already knows (sitemap_index.xml, post-, page-, category-,
// product-sitemapN, product_cat-sitemapN, store-, pa_lokalita-sitemap.xml; 200 URLs per file). Materialised into
// site_cache by rebuildSitemaps() (import Worker, daily); the routes only read. Imported by both Workers.
import { BASE, comboMin, isoPrague } from './site';
import { CITY, HOME_LOK } from './cities';

const PER_FILE = 200;
interface U { loc: string; mod: string }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
function urlset(urls: U[]): string {
  return HEAD + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `\t<url>\n\t\t<loc>${esc(u.loc)}</loc>${u.mod ? `\n\t\t<lastmod>${u.mod}</lastmod>` : ''}\n\t</url>`).join('\n') + '\n</urlset>';
}
const latest = (urls: U[]) => urls.reduce((m, u) => (u.mod > m ? u.mod : m), '');

export async function collect(db: D1Database): Promise<Record<string, U[]>> {
  const all = async <T>(sql: string) => (await db.prepare(sql).all<T>()).results;
  type R = { slug: string; m: string | null };
  const [posts, pages, products, cats, pcats, loks, stores, combos] = await Promise.all([
    all<R>("SELECT slug, modified_at AS m FROM posts WHERE type = 'post' AND status = 'publish' AND noindex = 0 ORDER BY published_at DESC"),
    all<R>("SELECT slug, modified_at AS m FROM posts WHERE type = 'page' AND status = 'publish' AND noindex = 0 AND slug <> 'blog' ORDER BY published_at DESC"),
    all<R>("SELECT slug, updated_at AS m FROM products WHERE active = 1 AND noindex = 0 ORDER BY updated_at DESC, id DESC"),
    all<R>(`SELECT c.slug, (SELECT MAX(x.created_at) FROM cat_products x WHERE x.cat_id = c.id) AS m FROM categories c
       WHERE c.noindex = 0 AND c.canon_id = 0 AND c.count_total > 0 AND c.seo_robots NOT LIKE '%noindex%'
         AND NOT EXISTS (SELECT 1 FROM redirects r WHERE r.from_path = '/' || c.slug || '/') ORDER BY c.count_total DESC`),
    all<R>("SELECT c.slug, (SELECT MAX(modified_at) FROM posts p WHERE p.cat_id = c.id AND p.type = 'post' AND p.status = 'publish') AS m FROM post_categories c WHERE c.count > 0"),
    all<R>("SELECT l.slug, (SELECT MAX(p.updated_at) FROM products p WHERE p.lok_id = l.id AND p.active = 1) AS m FROM lokality l WHERE l.count > 0 ORDER BY l.count DESC"),
    all<R>("SELECT s.slug, (SELECT MAX(p.updated_at) FROM products p WHERE p.store_id = s.id AND p.active = 1) AS m FROM stores s WHERE s.count > 0"),
    db.prepare("SELECT value FROM site_cache WHERE key = 'combos'").first<{ value: string }>(),
  ]);
  const map = (rows: R[], pre = '/') => rows.map((r) => ({ loc: `${BASE}${pre}${r.slug}/`, mod: isoPrague(String(r.m ?? '')) }));
  const out: Record<string, U[]> = {};
  out['post-sitemap'] = map(posts);
  const pg = map(pages);
  out['page-sitemap'] = [{ loc: BASE + '/', mod: latest([...pg, ...out['post-sitemap']!]) }, { loc: BASE + '/blog/', mod: latest(out['post-sitemap']!) }, ...pg];
  const chunk = (name: string, list: U[]) => {
    if (list.length <= PER_FILE) { if (list.length) out[name] = list; return; }
    for (let i = 0, n = 1; i < list.length; i += PER_FILE, n++) out[`${name}${n}`] = list.slice(i, i + PER_FILE);
  };
  chunk('product-sitemap', map(products));
  out['category-sitemap'] = map(pcats);
  // category × city landings (≥ COMBO_MIN offers, the 13 mapped cities) sit next to their categories
  const comboUrls: U[] = [];
  try {
    const cm = JSON.parse(combos?.value ?? '{}') as Record<string, Record<string, number>>;
    const bySlug = new Map((await all<{ id: number; slug: string; noindex: number; canon_id: number }>('SELECT id, slug, noindex, canon_id FROM categories')).map((c) => [c.id, c]));
    for (const [cid, cities] of Object.entries(cm)) {
      const c = bySlug.get(Number(cid));
      if (!c || c.noindex || c.canon_id) continue;
      for (const [city, n] of Object.entries(cities)) if (n >= comboMin(city) && city !== HOME_LOK && CITY[city]) comboUrls.push({ loc: `${BASE}/${c.slug}/lokalita/${city}/`, mod: '' });
    }
  } catch { /* no combos yet */ }
  const gifts = await all<{ slug: string; m: string | null }>("SELECT slug, '' AS m FROM slugs WHERE kind = 'gift'").catch(() => []);
  chunk('product_cat-sitemap', [...map(cats), ...map(gifts), ...comboUrls]);
  out['store-sitemap'] = map(stores, '/brand/');
  out['pa_lokalita-sitemap'] = map(loks, '/lokalita/');
  return out;
}

export async function rebuildSitemaps(db: D1Database): Promise<{ files: number; urls: number }> {
  const files = await collect(db);
  const now = new Date().toISOString();
  const keys = (pre: string) => Object.keys(files).filter((k) => k.startsWith(pre)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const order = ['post-sitemap', 'page-sitemap', ...keys('product-sitemap'), 'category-sitemap', ...keys('product_cat-sitemap'), 'store-sitemap', 'pa_lokalita-sitemap']
    .filter((k) => files[k]?.length);
  const index = HEAD + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    order.map((k) => `\t<sitemap>\n\t\t<loc>${BASE}/${k}.xml</loc>${latest(files[k]!) ? `\n\t\t<lastmod>${latest(files[k]!)}</lastmod>` : ''}\n\t</sitemap>`).join('\n') + '\n</sitemapindex>';
  const put = (k: string, v: string) => db.prepare('INSERT INTO site_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, now);
  const stmts = [put('sitemap:index', index)];
  for (const k of order) stmts.push(put(`sitemap:${k}`, urlset(files[k]!)));
  // drop files that no longer exist (catalogue shrank)
  stmts.push(db.prepare(`DELETE FROM site_cache WHERE key LIKE 'sitemap:%' AND updated_at <> ?`).bind(now));
  for (let i = 0; i < stmts.length; i += 25) await db.batch(stmts.slice(i, i + 25));
  return { files: order.length, urls: order.reduce((n, k) => n + files[k]!.length, 0) };
}
