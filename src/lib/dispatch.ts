// Resolves every path the way WordPress did on the Czech sister site (same URL shapes on kuzelnemiesta.sk):
//   /<slug>/(page/<n>/)                  → offer | product category | post | page (slugs table, one root namespace)
//   /<kat>/lokalita/<mesto>/(page/<n>/)  → category × city (child theme rewrite)
//   /lokalita/<mesto>/  /brand/<store>/  /blog/ — blog categories sit in the root like everything else
//   unknown → the old product bases (/slevy/<x>/, /kategorie-produktu/…/<x>/) to the last segment, /…/page/N/ of a dead
//            listing to its base, an offer-like slug (≥ 15 chars) to its section (kd-redirects.php fallback), else 404
import { guessSlug, resolveSlug } from './db';
import { fallbackTarget } from './kd';

const JUNK = /\.[a-z0-9]{2,5}$|^\/(\.|wp-|cgi-bin|admin|administrator|phpmyadmin|xmlrpc|vendor|api\/|_)/i;

export type Route =
  | { kind: 'product' | 'category' | 'post' | 'page' | 'gift'; id: number; page: number }
  | { kind: 'combo'; cat: number; city: string; page: number }
  | { kind: 'city'; city: string; page: number }
  | { kind: 'store'; store: string; page: number }
  | { kind: 'blog'; page: number }
  | { kind: 'search'; page: number }
  | { kind: 'postcat'; id: number; page: number }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

const enc = (s: string) => encodeURIComponent(s);
const pg = (base: string, n: number) => (n > 1 ? `${base}page/${n}/` : base);

export async function dispatch(db: D1Database, pathname: string): Promise<Route> {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return { kind: 'notfound' }; }
  const seg = path.split('/').filter(Boolean);
  let page = 1;
  if (seg.length >= 2 && seg[seg.length - 2] === 'page' && /^\d+$/.test(seg[seg.length - 1]!)) {
    page = Number(seg.pop());
    seg.pop();
    if (page <= 1) return { kind: 'redirect', to: '/' + seg.map(enc).join('/') + (seg.length ? '/' : '') };
  }
  // /page/N/?s=… = paged search, /page/N/ alone → home
  if (!seg.length) return page > 1 ? { kind: 'search', page } : { kind: 'notfound' };
  const s = seg.map((x) => x.toLowerCase());
  if (s[0] === 'lokalita' && s.length === 2) return { kind: 'city', city: s[1]!, page };
  if (s[0] === 'brand' && s.length === 2) return { kind: 'store', store: s[1]!, page };
  if (s[0] === 'blog' && s.length === 1) return { kind: 'blog', page };
  // Rank Math stripped the category base: /category/<x>/ → /<x>/
  if (s[0] === 'category' && s.length === 2) return { kind: 'redirect', to: pg(`/${enc(s[1]!)}/`, page) };
  if (s[0] === 'tag' && s.length === 2) return { kind: 'redirect', to: '/blog/' };
  if (s.length === 3 && s[1] === 'lokalita') {
    const c = await resolveSlug(db, s[0]!);
    if (c?.kind === 'category') return { kind: 'combo', cat: c.ref_id, city: s[2]!, page };
    // an old (Slevomat tree) category: its 301 target keeps the city
    const old = await db.prepare('SELECT to_path FROM redirects WHERE from_path = ?').bind(`/${s[0]}/`).first<{ to_path: string }>();
    if (old && /^\/[a-z0-9-]+\/$/.test(old.to_path)) return { kind: 'redirect', to: `${old.to_path}lokalita/${enc(s[2]!)}/` };
    return { kind: 'notfound' };
  }
  if (s.length === 1) {
    // WordPress kept non-ASCII slugs percent-encoded in lower case (Slevomat titles with U+2060 word joiners)
    const r = (await resolveSlug(db, s[0]!)) ?? (/[^\x00-\x7f]/.test(s[0]!) ? await resolveSlug(db, enc(s[0]!).toLowerCase()) : null);
    if (r) {
      if (page > 1 && r.kind !== 'category' && r.kind !== 'postcat' && r.kind !== 'gift') return { kind: 'redirect', to: `/${enc(s[0]!)}/` };
      return { kind: r.kind as 'product', id: r.ref_id, page };
    }
    if (JUNK.test(path)) return { kind: 'notfound' };
    // /<old category>/page/N/ → the new category's page N (the 301 table holds the base paths only)
    if (page > 1) {
      const old = await db.prepare('SELECT to_path FROM redirects WHERE from_path = ?').bind(`/${s[0]}/`).first<{ to_path: string }>();
      return old && old.to_path.startsWith('/') ? { kind: 'redirect', to: pg(old.to_path, page) } : { kind: 'redirect', to: fallbackTarget(s[0]!) };
    }
    const g = await guessSlug(db, s[0]!);
    if (g) return { kind: 'redirect', to: `/${g}/` };
    // /<offer>-2/ = an older copy of the same offer (WordPress guessed it the same way)
    const base = /^(.{15,})-\d{1,2}$/.exec(s[0]!)?.[1];
    if (base) { const b = await resolveSlug(db, base); if (b && b.kind === 'product') return { kind: 'redirect', to: `/${base}/` }; }
    return { kind: 'redirect', to: fallbackTarget(s[0]!) };
  }
  if (JUNK.test(path)) return { kind: 'notfound' };
  // old WooCommerce bases and parent paths: /slevy/<offer>/, /kategorie-produktu/<a>/<b>/, /<parent>/<child>/
  const last = await resolveSlug(db, s[s.length - 1]!);
  if (last && (last.kind === 'category' || last.kind === 'product')) return { kind: 'redirect', to: pg(`/${enc(s[s.length - 1]!)}/`, last.kind === 'category' ? page : 1) };
  const first = await resolveSlug(db, s[0]!);
  if (first && first.kind === 'category') return { kind: 'redirect', to: `/${enc(s[0]!)}/` };
  return { kind: 'redirect', to: fallbackTarget(path) };
}
