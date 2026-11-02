// View models for each page type: data from D1 + SEO meta (title, description, canonical, prev/next, robots, JSON-LD)
// matching the WordPress/Rank Math + child theme output. Templates only render what these return.
import {
  ancestry, biggestDiscounts, boxOffers, combos, endingSoon, latestPosts, listBy, listCategory, listGift, listPosts, loadCategory, loadPost, loadProduct, minPrice, popular,
  postCat, search, similar, tree,
  type Card, type Cat, type PostCard, type Tree,
} from './db';
import { isFiltered, parseFilters, toListQuery, toQuery, type FilterState } from './filters';
import { BASE, CURRENCY, HOST, LANG, SITE_NAME, comboMin, EXPIRED_KEEP_DAYS, OG_DEFAULT, PER_PAGE, POSTS_PER_PAGE, isoPrague } from './site';
import {
  BLOG_DESC, BLOG_TITLE, rmVars, categoryDesc, categoryTitle, cityDesc, cityTitle, clamp, comboDesc, comboTitle, productDesc, productTitle, paged, robots, withSite,
} from './seo';
import { BUY_Q, categoryFaq, categoryIntro, cityIntro, comboIntro, fallbackTarget, kindOf, SERVICE_CATS, themeTarget, type Kind } from './kd';
import { cityName, HOME_LOK } from './cities';
import { cena, cislo, datum, decode, place, ponuk, stripTags, tipov } from './format';
import type { Info } from '../../workers/import/src/parse';
import { catIcon } from './ikony';
import { partner as partnerOf, partnerName } from './partners';
import darky from '../data/darky.json';

export interface Gift { slug: string; name: string; h1: string; icon: string; il?: string; cats: string[]; max?: number; title: string; desc: string; intro: string; hub?: boolean; season?: string; body?: string; faq?: Array<{ q: string; a: string }> }
export const GIFTS = darky.items as Gift[];
/** Only these gift landings are linked from the home page, menu and landing sidebars; the rest stays reachable through categories and the sitemap. */
const TOP_GIFT_SLUGS = ['darcek-pre-muza', 'darcek-pre-zenu', 'darcek-pre-par', 'darcek-pre-deti', 'darcek-k-narodeninam', 'vianocne-darceky', 'darcek-pre-mamu', 'darcek-pre-otca', 'darcek-pre-manzela', 'darcek-pre-kamaratku', 'darcek-pre-priatelku', 'darcekovy-poukaz'];
export const TOP_GIFTS = TOP_GIFT_SLUGS.map((s) => GIFTS.find((g) => g.slug === s)!).filter(Boolean);

export interface Meta {
  title: string; description: string; canonical?: string | undefined; prev?: string | undefined; next?: string | undefined; robots: string[];
  ogType?: string; ogImage?: string; graph: unknown[]; jsonLd: unknown[];
}
export interface Crumb { name: string; url?: string }
export interface Chip { name: string; url: string; count?: number; active?: boolean; icon?: string; image?: string; grp?: string }

const abs = (p: string) => BASE + p;
/** first breadcrumb */
const HOME = 'Domov';
/** links to own pages in article HTML (absolute or root-relative) */
const OWN_LINK = new RegExp(`href="(?:https?://(?:www\\.)?${HOST.replace(/\./g, '\\.')})?/([a-z0-9-]+)/`, 'g');
const pagePath = (base: string, n: number) => (n <= 1 ? base : `${base}page/${n}/`);
function breadcrumbLd(items: Crumb[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.url ?? '/') })),
  };
}
function itemListLd(name: string, items: Card[]) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/${p.slug}/`), name: decode(p.name) })),
  };
}
const faqLd = (faq: Array<{ q: string; a: string }>) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
const collection = (url: string, title: string) => ({ '@type': 'CollectionPage', '@id': url + '#webpage', url, name: title, isPartOf: { '@id': BASE + '/#website' }, inLanguage: LANG });
/** "Všetko" chip (first of the city chips). */
const ALL = 'Všetko';

function rootKind(t: Tree, id: number): Kind {
  const chain = ancestry(t, id);
  return kindOf(chain[0]?.slug ?? '');
}
/** Cities whose combo with this category is a landing (≥ COMBO_MIN offers), Slovakia as a whole excluded — chips "Podľa mesta". */
function cityChips(cat: Cat, counts: Record<string, Record<string, number>>, current = ''): Chip[] {
  const c = counts[String(cat.id)] ?? {};
  const chips: Chip[] = [];
  for (const [slug, n] of Object.entries(c)) {
    if (slug === HOME_LOK || n < comboMin(slug) || !cityName(slug).known) continue;
    chips.push({ name: cityName(slug).nom, url: `/${cat.slug}/lokalita/${slug}/`, count: n, active: slug === current });
  }
  chips.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  if (chips.length) chips.unshift({ name: ALL, url: `/${cat.slug}/`, active: !current });
  return chips;
}
/** kd_render_related_categories: up to 8 siblings by size, else own children. */
function related(t: Tree, cat: Cat): Chip[] {
  const ok = (c: Cat) => c.count_total > 0 && !c.noindex && !c.canon_id;
  let list = (t.kids.get(cat.parent) ?? []).filter((c) => ok(c) && c.id !== cat.id);
  if (!list.length) list = (t.kids.get(cat.id) ?? []).filter(ok);
  return list.sort((a, b) => b.count_total - a.count_total).slice(0, 8).map((c) => ({ name: decode(c.name), url: `/${c.slug}/`, count: c.count_total, icon: catIcon(t, c.id) }));
}
/** Children in the tree order (taxonomie.json), with icon and group ("Typ pobytu", "Pre koho", "Kedy"). */
const subcats = (t: Tree, cat: Cat): Chip[] => (t.kids.get(cat.id) ?? []).filter((c) => c.count_total >= 1 && !c.noindex)
  .sort((a, b) => a.sort - b.sort).map((c) => ({ name: decode(c.name), url: `/${c.slug}/`, count: c.count_total, image: c.image, icon: catIcon(t, c.id), grp: c.grp }));

export interface ListingView {
  meta: Meta; crumbs: Crumb[]; h1: string; h2: string; intro: string; introTitle: string; descriptionHtml: string; bodyHtml?: string; items: Card[]; total: number;
  page: number; pages: number; base: string; qs: string; f: FilterState; filtered: boolean; chipsTitle: string; chips: Chip[]; related: Chip[];
  subcats: Chip[]; faq: Array<{ q: string; a: string }>; trust: string; tree: Tree; pageType: string; icon: string; section: string;
  gifts: Gift[]; ill?: string;
  /** left column: the section tree (groups of the section's children, the active branch opened) + cities */
  side: Side;
}
export interface SideItem extends Chip { kids?: Chip[] }
export interface Side { title: string; url: string; icon: string; groups: Array<{ g: string; items: SideItem[] }>; cities: Chip[] }

/** Sidebar of a category: its section's children by group; the branch of the current category is opened. */
function sectionSide(t: Tree, cat: Cat, cc: Record<string, Record<string, number>>, city = ''): Side {
  const chain = ancestry(t, cat.id);
  const root = chain[0] ?? cat;
  const open = new Set(chain.map((c) => c.id));
  const ok = (c: Cat) => c.count_total > 0 && !c.noindex;
  const groups = new Map<string, SideItem[]>();
  for (const k of (t.kids.get(root.id) ?? []).filter(ok).sort((a, b) => a.sort - b.sort)) {
    const kids = open.has(k.id) ? (t.kids.get(k.id) ?? []).filter(ok).sort((a, b) => a.sort - b.sort)
      .map((x) => ({ name: decode(x.name), url: `/${x.slug}/`, count: x.count_total, active: x.id === cat.id })) : undefined;
    const item: SideItem = { name: decode(k.name), url: `/${k.slug}/`, count: k.count_total, active: k.id === cat.id, icon: catIcon(t, k.id), ...(kids?.length ? { kids } : {}) };
    (groups.get(k.grp) ?? groups.set(k.grp, []).get(k.grp)!).push(item);
  }
  const cities = cityChips(cat, cc, city).filter((c) => c.name !== ALL).slice(0, 10);
  return { title: root.short || decode(root.name), url: `/${root.slug}/`, icon: catIcon(t, root.id), groups: [...groups.entries()].map(([g, items]) => ({ g, items })), cities };
}
/** Sidebar of pages outside the tree (city, partner, gifts): the five sections. */
function sectionsSide(t: Tree, title = 'Kategórie'): Side {
  const items = (t.kids.get(0) ?? []).filter((c) => c.count_total > 0).sort((a, b) => a.sort - b.sort)
    .map((c) => ({ name: c.short || decode(c.name), url: `/${c.slug}/`, count: c.count_total, icon: catIcon(t, c.id) }));
  return { title, url: '/', icon: 'darek', groups: [{ g: '', items }], cities: [] };
}
type Redirect = { redirect: string };

// ---------- category / combo ----------
export async function categoryView(db: D1Database, catId: number, page: number, sp: URLSearchParams, city = ''): Promise<ListingView | Redirect | null> {
  const [cat, t, cc, minP] = await Promise.all([loadCategory(db, catId), tree(db), combos(db), minPrice(db, catId)]);
  if (!cat) return null;
  const f = parseFilters(sp);
  const filtered = isFiltered(f);
  const lok = city ? t.lokBySlug.get(city) : undefined;
  if (city && !lok) return { redirect: `/${cat.slug}/` };
  const store = f.partner ? [...t.stores.values()].find((s) => s.slug === f.partner) : undefined;
  const q = toListQuery(f, page, store?.id);
  if (lok) q.lok = lok.id;
  const { items, total } = await listCategory(db, cat.id, q);
  const pages = Math.max(1, Math.ceil(total / 24));
  const base = city ? `/${cat.slug}/lokalita/${city}/` : `/${cat.slug}/`;
  if (page > pages && page > 1) return { redirect: base };
  const name = decode(cat.name);
  const kind = rootKind(t, cat.id);
  const chain = ancestry(t, cat.id);
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` }))];
  const url = abs(pagePath(base, page));
  let title: string, description: string, canonical: string | undefined, h1: string, h2: string, intro: string, introTitle: string, trust = '';
  let noindex = cat.noindex === 1 || cat.seo_robots.includes('noindex') || cat.count_total === 0;
  if (lok) {
    const cn = cityName(lok.slug);
    const n = cc[String(cat.id)]?.[lok.slug] ?? total;
    title = comboTitle(name, cn.lok, n);
    description = comboDesc(name, cn.lok, n);
    h1 = `${name} ${cn.lok}`;
    h2 = `${name} ${cn.lok} — ${cislo(n)} ${ponuk(n)}`;
    introTitle = `${name} ${cn.lok}`;
    intro = comboIntro(name, cn.lok, n, kind);
    trust = `${cislo(n)}+ ponúk – ${name.toLowerCase()} ${cn.lok}`;
    // a thin combination is not a landing: canonical to the category (WordPress did the same)
    canonical = cn.known && n >= comboMin(lok.slug) ? url : abs(`/${cat.slug}/`);
    if (!cn.known) title = categoryTitle(name, cat.count_total, minP);
  } else {
    title = categoryTitle(name, cat.count_total, minP);
    description = categoryDesc(name, cat.count_total, minP);
    h1 = name;
    h2 = `${name} — ${cislo(cat.count_total)} ${ponuk(cat.count_total)}`;
    introTitle = `Ako vybrať v kategórii ${name}`;
    intro = categoryIntro(name, kind);
    // same-name duplicate categories point their canonical at the main one (kd_dup_canon_map)
    const main = cat.canon_id ? t.byId.get(cat.canon_id) : undefined;
    canonical = main ? abs(`/${main.slug}/`) : url;
  }
  if (lok) crumbs.push({ name: cityName(lok.slug).nom, url: base });
  // the category's own questions first (written for its searches), then the general "how buying works" one
  let own: Array<{ q: string; a: string }> = [];
  try { own = cat.faq_json ? JSON.parse(cat.faq_json) as typeof own : []; } catch { /* none */ }
  const faq = own.length && !lok ? [...own, ...categoryFaq(name, kind).filter((x) => BUY_Q.test(x.q)).slice(0, 1)] : categoryFaq(name, kind);
  const meta: Meta = {
    title: paged(title, page), description, robots: filtered ? ['noindex', 'follow'] : robots(noindex, cat.seo_robots),
    ...(noindex || filtered ? {} : { canonical }),
    ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
    ogImage: cat.image || OG_DEFAULT,
    graph: [collection(url, title)],
    jsonLd: [breadcrumbLd(lok ? crumbs.slice(0, -1) : crumbs), itemListLd(name, items), faqLd(faq)].filter(Boolean),
  };
  return {
    meta, crumbs, h1, h2, intro: cat.body_html && !lok ? '' : intro, introTitle, descriptionHtml: page === 1 && !lok && !filtered ? cat.description_html : '', bodyHtml: page === 1 && !lok && !filtered ? cat.body_html : '', items, total, page, pages, base,
    qs: toQuery(f), f, filtered, chipsTitle: 'Podľa mesta', chips: cityChips(cat, cc, lok?.slug), related: related(t, cat), subcats: lok ? [] : subcats(t, cat),
    faq, trust, tree: t, pageType: lok ? 'combo' : 'category', icon: catIcon(t, cat.id), section: chain[0]?.slug ?? '', side: sectionSide(t, cat, cc, lok?.slug),
    gifts: chain[0] ? GIFTS.filter((g) => !g.hub && g.cats.some((s) => s === chain[0]!.slug || chain.some((c) => c.slug === s))).slice(0, 6) : [],
  };
}

// ---------- city ----------
export async function cityView(db: D1Database, slug: string, page: number, sp: URLSearchParams): Promise<ListingView | Redirect | null> {
  const [t, cc] = await Promise.all([tree(db), combos(db)]);
  const lok = t.lokBySlug.get(slug);
  if (!lok) return null;
  const f = parseFilters(sp);
  const filtered = isFiltered(f);
  const store = f.partner ? [...t.stores.values()].find((s) => s.slug === f.partner) : undefined;
  const { items, total } = await listBy(db, { lok: lok.id, ...(store ? { store: store.id } : {}) }, toListQuery(f, page));
  const pages = Math.max(1, Math.ceil(total / 24));
  const base = `/lokalita/${slug}/`;
  if (page > pages && page > 1) return { redirect: base };
  const cn = cityName(slug);
  const url = abs(pagePath(base, page));
  const title = cityTitle(cn.lok);
  const chips: Chip[] = [];
  if (cn.known) {
    for (const [cs, label] of SERVICE_CATS) {
      const c = t.bySlug.get(cs);
      const n = c ? cc[String(c.id)]?.[slug] ?? 0 : 0;
      if (c && n >= comboMin(slug)) chips.push({ name: label, url: `/${cs}/lokalita/${slug}/`, count: n });
    }
  }
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, { name: cn.nom, url: base }];
  const noindex = lok.count === 0;
  return {
    meta: {
      title: paged(title, page), description: cityDesc(cn.nom, lok.count), robots: filtered ? ['noindex', 'follow'] : robots(noindex),
      ...(noindex || filtered ? {} : { canonical: url }),
      ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
      ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
      graph: [collection(url, title)], jsonLd: [breadcrumbLd(crumbs), itemListLd(`Zážitky a pobyty ${cn.lok}`, items)].filter(Boolean),
    },
    crumbs, h1: `Zážitky a pobyty ${cn.lok}`, h2: '', intro: page === 1 ? cityIntro(cn.lok) : '', introTitle: '', descriptionHtml: '', items, total, page, pages, base,
    qs: toQuery(f), f, filtered, chipsTitle: 'Podľa kategórie', chips, related: [], subcats: [], faq: [], trust: `${cislo(lok.count)}+ ponúk ${cn.lok}`,
    tree: t, pageType: 'city', icon: 'mesto', section: '', gifts: [],
    side: chips.length ? { title: cn.nom, url: base, icon: 'mesto', groups: [{ g: 'Podľa kategórie', items: chips }], cities: [] } : sectionsSide(t),
  };
}

// ---------- store (/brand/<slug>/) ----------
export async function storeView(db: D1Database, slug: string, page: number, sp: URLSearchParams): Promise<ListingView | Redirect | null> {
  const t = await tree(db);
  const st = [...t.stores.values()].find((s) => s.slug === slug);
  if (!st) return null;
  const f = parseFilters(sp);
  f.partner = '';
  const filtered = isFiltered(f);
  const { items, total } = await listBy(db, { store: st.id }, toListQuery(f, page));
  const pages = Math.max(1, Math.ceil(total / 24));
  const base = `/brand/${slug}/`;
  if (page > pages && page > 1) return { redirect: base };
  const url = abs(pagePath(base, page));
  const title = withSite(st.name);
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, { name: decode(st.name), url: base }];
  return {
    meta: {
      title: paged(title, page), description: clamp(stripTags(st.description_html)), robots: filtered ? ['noindex', 'follow'] : robots(false),
      ...(filtered ? {} : { canonical: url }),
      ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
      ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
      graph: [collection(url, title)], jsonLd: [breadcrumbLd(crumbs)],
    },
    crumbs, h1: decode(st.name), h2: '', intro: '', introTitle: '', descriptionHtml: page === 1 ? st.description_html : '', items, total, page, pages, base,
    qs: toQuery(f), f, filtered, chipsTitle: '', chips: [], related: [], subcats: [], faq: [], trust: '', tree: t, pageType: 'store', icon: '', section: '', gifts: [], side: sectionsSide(t),
  };
}

// ---------- gift landing (src/data/darky.json) ----------
export async function giftView(db: D1Database, idx: number, page: number, sp: URLSearchParams): Promise<ListingView | Redirect | null> {
  const g = GIFTS[idx];
  if (!g) return null;
  const t = await tree(db);
  const f = parseFilters(sp);
  const filtered = isFiltered(f);
  const store = f.partner ? [...t.stores.values()].find((s) => s.slug === f.partner) : undefined;
  const ids = g.cats.map((s) => t.bySlug.get(s)?.id).filter((x): x is number => !!x);
  const { items, total } = await listGift(db, ids, { ...toListQuery(f, page, store?.id), cap: g.max });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = `/${g.slug}/`;
  if (page > pages && page > 1) return { redirect: base };
  const url = abs(pagePath(base, page));
  const hub = GIFTS.find((x) => x.hub)!;
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, ...(g.hub ? [] : [{ name: hub.name, url: `/${hub.slug}/` }]), { name: g.name === hub.name ? g.name : g.h1.split(':')[0]!, url: base }];
  const faq = g.faq?.length ? g.faq : categoryFaq(g.name, 'zazitek');
  return {
    meta: {
      title: paged(g.title, page), description: g.desc, robots: filtered ? ['noindex', 'follow'] : robots(false),
      ...(filtered ? {} : { canonical: url }),
      ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
      ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
      ogImage: items[0]?.image || OG_DEFAULT,
      graph: [collection(url, g.title)], jsonLd: [breadcrumbLd(crumbs), itemListLd(g.h1, items), faqLd(faq)].filter(Boolean),
    },
    crumbs, h1: g.h1, h2: `${cislo(total)} ${tipov(total)} na darček`, intro: '', introTitle: '', descriptionHtml: page === 1 ? `<p>${g.intro}</p>` : '', bodyHtml: page === 1 && !filtered ? g.body ?? '' : '',
    items, total, page, pages, base, qs: toQuery(f), f, filtered, chipsTitle: 'Ďalšie tipy na darček',
    chips: [...TOP_GIFTS, ...(TOP_GIFTS.includes(g) || g.hub ? [] : [g])].map((x) => ({ name: x.name, url: `/${x.slug}/`, active: x.slug === g.slug, icon: x.icon })),
    related: [], subcats: [], faq, trust: '', tree: t, pageType: 'gift', icon: g.icon, section: 'darky', gifts: [], ...(g.il ? { ill: g.il } : {}),
    side: { title: 'Tipy na darček', url: `/${hub.slug}/`, icon: 'darek', groups: [{ g: '', items: [...TOP_GIFTS, ...(TOP_GIFTS.includes(g) || g.hub ? [] : [g])].map((x) => ({ name: x.name, url: `/${x.slug}/`, icon: x.icon, active: x.slug === g.slug })) }], cities: [] },
  };
}

// ---------- offer ----------
export async function productView(db: D1Database, id: number) {
  const [p, t] = await Promise.all([loadProduct(db, id), tree(db)]);
  if (!p) return null;
  let catIds: number[] = [];
  try { catIds = JSON.parse(p.cat_ids) as number[]; } catch { /* none */ }
  const primary = t.byId.get(p.primary_cat) ?? t.byId.get(catIds[0] ?? 0);
  // an offer that ended 30+ days ago: 301 to its category (kd-redirects.php did the same right away)
  if (!p.active) {
    const ended = Date.parse((p.expired_at || p.updated_at).replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ended) || Date.now() - ended > EXPIRED_KEEP_DAYS * 86400_000) return { redirect: primary && primary.count_total > 0 ? `/${primary.slug}/` : themeTarget(p.slug) } as const;
  }
  let info: Info = {};
  try { info = JSON.parse(p.info) as Info; } catch { /* legacy */ }
  let images: string[] = [];
  try { images = JSON.parse(p.images) as string[]; } catch { /* none */ }
  const chain = primary ? ancestry(t, primary.id) : [];
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` })), { name: decode(p.name), url: `/${p.slug}/` }];
  const more = await similar(db, primary?.id ?? 0, p.id, p.active ? 8 : 12, p.lok_id);
  const url = abs(`/${p.slug}/`);
  const name = decode(p.name);
  const where0 = place(p.city, info.cc);
  const store = t.stores.get(p.store_id);
  const pt = partnerOf(store?.slug);
  const unit = pt.unit ?? '';
  const title = productTitle(p.name, info.ts ?? '', where0, p.price, p.seo_title, (info.va?.length ?? 0) > 1, unit);
  const description = productDesc(p.seo_desc, name, info.h || p.excerpt || info.d || '', where0, p.price, pt.voucher !== false, unit);
  const offer = p.active ? {
    '@type': 'Offer', url, price: p.price, priceCurrency: CURRENCY, availability: 'https://schema.org/InStock',
    ...(unit ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: CURRENCY, unitText: unit.replace(/^za /, '') } } : {}),
    ...(info.de ? { priceValidUntil: info.de } : {}), ...(store ? { seller: { '@type': 'Organization', name: decode(store.name) } } : {}),
  } : undefined;
  const meta: Meta = {
    title, description, canonical: p.active && !p.noindex ? url : undefined, robots: robots(!p.active || p.noindex === 1),
    ogType: 'product', ogImage: p.image || OG_DEFAULT,
    graph: [
      { '@type': 'ItemPage', '@id': url + '#webpage', url, name: title, datePublished: isoPrague(p.created_at), dateModified: isoPrague(p.updated_at), isPartOf: { '@id': BASE + '/#website' }, inLanguage: LANG },
      ...(offer ? [{
        '@type': 'Product', '@id': url + '#product', name, description: clamp(description, 300), ...(p.image ? { image: [p.image, ...images.slice(0, 3)] } : {}),
        ...(primary ? { category: decode(primary.name) } : {}), ...(store ? { brand: { '@type': 'Brand', name: decode(store.name) } } : {}), offers: offer, mainEntityOfPage: { '@id': url + '#webpage' },
      }] : []),
    ],
    jsonLd: [breadcrumbLd(crumbs)],
  };
  const partner = partnerName(store?.slug);
  const faq = p.active ? offerFaq(name, p, info, partner, pt.voucher !== false) : [];
  if (faq.length) meta.jsonLd.push(faqLd(faq));
  return { meta, p, info, images, crumbs, primary, more, store, kind: rootKind(t, primary?.id ?? 0), tree: t, section: chain[0]?.slug ?? '', fit: offerFit(t, p, info, catIds), faq };
}

/** Zlavomat TAGS (mostly Czech even in the Slovak feed; Slovak spellings accepted too, lower case) → [Slovak label, our
 *  category]. A tag without a matching node (e.g. "dovolenka so zárukou") has no category and is left out of the chips. */
const TAGS: Record<string, [string, string]> = {
  'víkendový pobyt': ['Víkendový pobyt', 'vikendove-pobyty'],
  'wellness pobyt': ['Wellness pobyt', 'wellness-pobyty'],
  'rodinná dovolená': ['Rodinná dovolenka', 'pobyty-s-detmi'], 'rodinná dovolenka': ['Rodinná dovolenka', 'pobyty-s-detmi'],
  'romantický pobyt': ['Romantický pobyt', 'pobyty-pre-dvoch'],
  'aktivní dovolená': ['Aktívna dovolenka', 'aktivna-dovolenka-a-sport'], 'aktívna dovolenka': ['Aktívna dovolenka', 'aktivna-dovolenka-a-sport'],
  'lyžařský pobyt': ['Lyžiarsky pobyt', 'lyziarske-pobyty'], 'lyžiarsky pobyt': ['Lyžiarsky pobyt', 'lyziarske-pobyty'],
  'dovolená u moře': ['Dovolenka pri mori', 'dovolenka-pri-mori'], 'dovolenka pri mori': ['Dovolenka pri mori', 'dovolenka-pri-mori'],
  'velikonoční pobyt': ['Veľkonočný pobyt', 'velkonocne-pobyty'], 'veľkonočný pobyt': ['Veľkonočný pobyt', 'velkonocne-pobyty'],
  'silvestrovský pobyt': ['Silvestrovský pobyt', 'silvestrovske-pobyty'],
  'vánoční pobyt': ['Vianočný pobyt', 'vianocne-pobyty'], 'vianočný pobyt': ['Vianočný pobyt', 'vianocne-pobyty'],
  'valentýnský pobyt': ['Valentínsky pobyt', 'valentinske-pobyty'], 'valentínsky pobyt': ['Valentínsky pobyt', 'valentinske-pobyty'],
  'dovolenka so zárukou': ['Dovolenka so zárukou', ''],
  'adventní zájezd': ['Adventný zájazd', ''], 'adventný zájazd': ['Adventný zájazd', ''],
  aquapark: ['Aquapark', ''],
  'eurovíkend': ['Eurovíkend', ''],
  'děti zdarma': ['Deti zdarma', ''], 'deti zdarma': ['Deti zdarma', ''],
  'exotická dovolená': ['Exotická dovolenka', ''], 'exotická dovolenka': ['Exotická dovolenka', ''],
  'skipas v ceně': ['Skipas v cene', ''], 'skipas v cene': ['Skipas v cene', ''],
};
/** A feed tag as shown on the site (Slovak). */
export const tagLabel = (tag: string): string => TAGS[tag.toLowerCase()]?.[0] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
/** The cheapest budget gift landing ("darčeky do X €") takes every offer up to its limit; the others only the upper half. */
const MIN_GIFT_MAX = Math.min(...GIFTS.map((g) => g.max ?? Infinity));
/** "Pre koho sa hodí": the offer's tags and categories as links (ours), then the gift landings it belongs to. */
function offerFit(t: Tree, p: { price: number }, info: Info, catIds: number[]): Chip[] {
  const out: Chip[] = [], seen = new Set<string>();
  const add = (c: Cat | undefined, name?: string) => { if (c && c.count_total > 0 && !c.noindex && !seen.has(c.slug)) { seen.add(c.slug); out.push({ name: name ?? decode(c.name), url: `/${c.slug}/`, icon: catIcon(t, c.id) }); } };
  for (const tag of info.tags ?? []) { const m = TAGS[tag.toLowerCase()]; if (m?.[1]) add(t.bySlug.get(m[1]), m[0]); }
  for (const id of catIds) { const c = t.byId.get(id); if (c && c.parent) add(c); }
  out.splice(7);
  const mine = new Set(catIds.flatMap((id) => ancestry(t, id).map((c) => c.slug)));
  for (const g of GIFTS) {
    if (g.hub || g.season) continue;
    if (g.max ? p.price <= g.max && (g.max === MIN_GIFT_MAX || p.price > g.max / 2) : g.cats.some((c) => mine.has(c))) out.push({ name: g.h1.split(':')[0]!, url: `/${g.slug}/`, icon: g.icon });
  }
  return out.slice(0, 10);
}
/** Questions a buyer asks, answered only from the feed (nothing that the offer does not state). */
function offerFaq(name: string, p: { price: number; price_old: number; city: string }, info: Info, partner: string, voucher: boolean): Array<{ q: string; a: string }> {
  const faq: Array<{ q: string; a: string }> = [];
  if (info.pv?.a) faq.push({ q: 'Kde sa ponuka nachádza?', a: `${info.pv.t ? info.pv.t + ', ' : ''}${info.pv.a}.` });
  if (info.ve) faq.push({ q: 'Do kedy platí voucher?', a: `Voucher môžete uplatniť ${info.vs ? `od ${datum(info.vs)} ` : ''}do ${datum(info.ve)}. Podrobné podmienky a možné termíny nájdete v ponuke u ${partner}.` });
  const inc = [...(info.in?.i ?? []), ...(info.bo ? [`strava: ${info.bo}`] : [])];
  if (inc.length) faq.push({ q: 'Čo je v cene?', a: inc.slice(0, 8).join(', ') + '.' });
  if (p.price > 0) faq.push({ q: 'Koľko to stojí?', a: `Teraz ${cena(p.price)}${p.price_old > p.price ? ` namiesto ${cena(p.price_old)}, ušetríte ${cena(p.price_old - p.price)}` : ''}. Cena je rovnaká ako priamo u ${partner}.` });
  if (voucher) faq.push({ q: 'Môžem ponuku darovať?', a: `Áno. Po zaplatení u ${partner} vám voucher príde e-mailom — môžete ho vytlačiť alebo poslať obdarovanému.` });
  faq.push({ q: 'Ako prebieha nákup?', a: `Tlačidlom „Objednať“ prejdete na stránku ${partner}, kde ponuku „${name}“ zaplatíte. ${SITE_NAME} ponuky iba vyhľadáva a porovnáva, platba aj voucher idú priamo cez partnera.` });
  return faq;
}

// ---------- post / page ----------
export async function postView(db: D1Database, id: number) {
  const post = await loadPost(db, id);
  if (!post) return null;
  const t = await tree(db);
  const url = abs(`/${post.slug}/`);
  const title = post.seo_title ? rmVars(post.seo_title, post.title) : withSite(post.title);
  let ld: { graph?: unknown[] } = {};
  try { ld = post.ld_json ? JSON.parse(post.ld_json) : {}; } catch { /* none */ }
  const graph = ld.graph?.length ? ld.graph : [{
    '@type': post.type === 'post' ? 'BlogPosting' : 'WebPage', '@id': url + '#webpage', url, headline: decode(post.title), name: title,
    datePublished: isoPrague(post.published_at), dateModified: isoPrague(post.modified_at), inLanguage: LANG, isPartOf: { '@id': BASE + '/#website' },
    ...(post.image ? { image: abs(post.image) } : {}), author: { '@type': 'Organization', name: SITE_NAME, url: BASE },
  }];
  const crumbs: Crumb[] = post.type === 'post' ? [{ name: HOME, url: '/' }, { name: 'Blog', url: '/blog/' }, { name: decode(post.title), url: `/${post.slug}/` }] : [{ name: HOME, url: '/' }, { name: decode(post.title), url: `/${post.slug}/` }];
  // offer boxes (kd_post_offers): meta kd_offers_cat, else the most linked category with ≥ 4 offers
  let boxCat: Cat | undefined;
  if (post.type === 'post') {
    boxCat = post.offers_cat ? t.bySlug.get(post.offers_cat) : undefined;
    if (!boxCat) {
      const freq = new Map<string, number>();
      for (const m of post.content_html.matchAll(OWN_LINK)) freq.set(m[1]!, (freq.get(m[1]!) ?? 0) + 1);
      for (const [slug] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
        const c = t.bySlug.get(slug);
        if (c && c.count_total >= 4) { boxCat = c; break; }
      }
      // still none: the closest category for the topic of the title/slug (the same keyword rules as the 404 redirects), else all experiences
      if (!boxCat) {
        const slug = fallbackTarget(`${post.slug} ${post.title}`).replace(/\//g, '');
        const c = t.bySlug.get(slug) ?? t.bySlug.get('zazitky');
        if (c && c.count_total >= 4) boxCat = c;
      }
    }
  }
  const seed = `${boxCat?.id ?? 0}:${new Date().toISOString().slice(0, 10)}:${Math.floor(new Date().getUTCHours() / 6)}`;
  const box = boxCat ? await boxOffers(db, boxCat.id, seed) : [];
  const more = post.type === 'post' ? await latestPosts(db, 3, post.id, post.cat_id) : [];
  const meta: Meta = {
    title, description: post.seo_desc || clamp(stripTags(post.excerpt || post.content_html)),
    canonical: post.noindex ? undefined : (post.canonical || url), robots: robots(post.noindex === 1, post.seo_robots),
    ogType: 'article', ogImage: post.image ? abs(post.image) : OG_DEFAULT, graph, jsonLd: [breadcrumbLd(crumbs)],
  };
  return { meta, post, crumbs, box: box.length >= 2 ? box : [], boxCat, more };
}

// ---------- blog ----------
export async function blogView(db: D1Database, page: number, catId = 0) {
  const cat = catId ? await postCat(db, catId) : null;
  if (catId && !cat) return null;
  const { items, total } = await listPosts(db, page, cat?.id);
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const base = cat ? `/${cat.slug}/` : '/blog/';
  if (page > pages && page > 1) return { redirect: base } as const;
  const url = abs(pagePath(base, page));
  const title = cat ? withSite(cat.name) : BLOG_TITLE;
  const crumbs: Crumb[] = [{ name: HOME, url: '/' }, { name: 'Blog', url: '/blog/' }, ...(cat ? [{ name: decode(cat.name), url: base }] : [])];
  const cats = (await db.prepare("SELECT slug, name, count FROM post_categories WHERE count > 0 ORDER BY count DESC").all<{ slug: string; name: string; count: number }>()).results;
  return {
    meta: {
      title: paged(title, page), description: cat ? clamp(cat.description) || BLOG_DESC : BLOG_DESC, canonical: url, robots: robots(false),
      ...(page > 1 ? { prev: abs(pagePath(base, page - 1)) } : {}), ...(page < pages ? { next: abs(pagePath(base, page + 1)) } : {}),
      graph: [collection(url, title)], jsonLd: [breadcrumbLd(crumbs)],
    } as Meta,
    h1: cat ? decode(cat.name) : 'Blog', items, total, page, pages, base, crumbs, cats, current: cat?.slug ?? '',
  };
}

// ---------- home + search ----------
export async function homeView(db: D1Database) {
  const [t, top, posts, ending, deals] = await Promise.all([tree(db), popular(db, 8), latestPosts(db, 3), endingSoon(db, 8), biggestDiscounts(db, 8)]);
  const sec = (t.kids.get(0) ?? []).filter((c) => c.count_total > 0).sort((a, b) => a.sort - b.sort);
  const POPULAR = ['wellness-pobyty', 'glamping', 'masaze', 'jazda-na-okruhu', 'escape-room', 'degustacne-menu'];
  const pop = POPULAR.map((s) => t.bySlug.get(s)).filter((c): c is Cat => !!c && c.count_total > 0);
  // every tile gets its own photo: the best offers of the category in the mixed order, the first photo nobody uses yet
  const used = new Set(top.slice(0, 2).map((x) => x.image));
  const tiles = [...sec, ...pop];
  const photos = await db.batch(tiles.map((c) => db.prepare("SELECT p.image AS i FROM cat_products x JOIN products p ON p.id = x.product_id WHERE x.cat_id = ? AND p.image <> '' ORDER BY x.mix DESC LIMIT 12").bind(c.id)));
  const photoOf = new Map<number, string>();
  tiles.forEach((c, i) => {
    const imgs = (photos[i]!.results as Array<{ i: string }>).map((r) => r.i);
    const img = imgs.find((x) => !used.has(x)) ?? c.image;
    used.add(img); photoOf.set(c.id, img);
  });
  const sections = sec.map((c) => ({ name: c.short || decode(c.name), url: `/${c.slug}/`, count: c.count_total, image: photoOf.get(c.id) ?? c.image, icon: catIcon(t, c.id), slug: c.slug,
      kids: (t.kids.get(c.id) ?? []).filter((k) => k.count_total >= 5).sort((a, b) => b.count_total - a.count_total).slice(0, 5).map((k) => ({ name: decode(k.name), url: `/${k.slug}/` })) }));
  const popularCats = pop.map((c) => ({ name: c.short || decode(c.name), url: `/${c.slug}/`, count: c.count_total, image: photoOf.get(c.id) ?? c.image, icon: catIcon(t, c.id) }));
  const total = [...t.stores.values()].reduce((n, s) => n + s.count, 0);
  const cities = [...t.loks.values()].filter((l) => l.slug !== HOME_LOK && l.count > 0 && cityName(l.slug).known).sort((a, b) => b.count - a.count).slice(0, 12);
  const month = new Date().getMonth() + 1;
  const season = month >= 11 ? GIFTS.find((g) => g.slug === 'vianocne-darceky') : month <= 2 ? GIFTS.find((g) => g.slug === 'darcek-na-valentina') : undefined;
  const seasonItems = season ? (await listGift(db, season.cats.map((s) => t.bySlug.get(s)?.id).filter((x): x is number => !!x), { page: 1, sort: 'pop' })).items.slice(0, 8) : [];
  const title = `Zážitky a zážitkové darčeky online | ${SITE_NAME}`;
  const meta: Meta = {
    title, description: `Zážitky pre každého: wellness pobyty, glamping, masáže, jazdy v superšportoch, lety aj kurzy. ${cislo(total)} ${ponuk(total)} od overených partnerov, voucher hneď e-mailom.`,
    canonical: BASE + '/', robots: robots(false), ogType: 'website', graph: [{ '@type': 'WebPage', '@id': BASE + '/#webpage', url: BASE + '/', name: title, isPartOf: { '@id': BASE + '/#website' }, inLanguage: LANG }], jsonLd: [],
  };
  return { meta, sections, popularCats, top, posts, total, cities, ending, deals, season, seasonItems, gifts: TOP_GIFTS, tree: t };
}

export async function searchView(db: D1Database, q: string, page: number) {
  const { items, total } = await search(db, q, page);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  return {
    meta: { title: q ? `${q} – hľadanie | ${SITE_NAME}` : `Hľadanie | ${SITE_NAME}`, description: '', robots: ['noindex', 'follow'], graph: [], jsonLd: [] } as Meta,
    q, items, total, page, pages,
  };
}

export type ProductView = NonNullable<Exclude<Awaited<ReturnType<typeof productView>>, { redirect: string }>>;
export type PostView = NonNullable<Awaited<ReturnType<typeof postView>>>;
export type BlogView = Exclude<NonNullable<Awaited<ReturnType<typeof blogView>>>, { redirect: string }>;
export type HomeView = Awaited<ReturnType<typeof homeView>>;
export type SearchView = Awaited<ReturnType<typeof searchView>>;
export type { PostCard };
