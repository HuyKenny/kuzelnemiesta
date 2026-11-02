// One feed element → a normalised offer, with the same filters, fields and categories as the WP All Import templates
// (imports 25/26 Slevomat, 27 Adrop, 28 Zážitky.cz). Everything the detail page shows goes into `info` (compact JSON).
import type { XmlNode } from './xml/stream';
import { ADROP_SKIP, SLEVOMAT_GOODS, SLEVOMAT_MAP, SLEVOMAT_SKIP, SLEVOMAT_TRAVEL_MAP, affiliateUrl, type Source } from './feeds';
import { classify } from './classify';
import { holidayCats } from './geo';

export interface Info {
  /** description (plain text, paragraphs separated by \n) */
  d?: string | undefined;
  /** highlights (Slevomat) */
  h?: string | undefined;
  /** short title (Slevomat) */
  ts?: string | undefined;
  /** provider or accommodation: title, address, GPS, own web */
  pv?: { t?: string | undefined; a?: string | undefined; lat?: string | undefined; lng?: string | undefined } | undefined;
  /** board / transport (Slevomat travel) */
  bo?: string | undefined; tr?: string | undefined;
  /** what the price includes: short items + groups of lines */
  in?: { i?: string[] | undefined; g?: Array<[string, string[]]> } | undefined;
  /** voucher valid until / deal ends (YYYY-MM-DD) */
  ve?: string | undefined; de?: string | undefined;
  /** customers so far, priority (Slevomat) */
  cu?: number | undefined; pr?: number | undefined;
  tags?: string[] | undefined;
  /** params (Adrop) */
  pa?: Array<[string, string]> | undefined;
  /** variants: label, price and — when the variant has its own page (Adrop) — its affiliate target (/go/<id>/?v=<n>) */
  va?: Array<[string, number, string?]> | undefined;
  /** accommodation amenities (Slevomat TRAVEL/ACCOMMODATION_PARAMS) */
  ap?: string[] | undefined;
  /** accommodation rating /10 and its review count */
  ar?: number | undefined; arc?: number | undefined;
  /** departure place (tours), country code */
  dp?: string | undefined; cc?: string | undefined;
  /** vouchers on sale in total (remaining = mx − cu), voucher valid from */
  mx?: number | undefined; vs?: string | undefined;
}

export interface Item {
  ext: string;
  name: string;
  target: string;
  image: string;
  images: string[];
  price: number;
  priceOld: number;
  /** pa_lokalita slug ('' = none) */
  lok: string;
  /** city as the feed spells it (diacritics); the importer falls back to the known-city table */
  city?: string | undefined;
  /** category path: [root, child, child …] — children hang directly under the root, like the WPAI manual hierarchy */
  cats: string[];
  excerpt: string;
  rating: number;
  reviews: number;
  info: Info;
  /** Adrop: variant dimensions (city, specification, duration, persons, size), merged and dropped by finishVariants() */
  vparts?: string[][] | undefined;
}

const kids = (n: XmlNode, name: string) => n.children.filter((c) => c.name === name);
const kid = (n: XmlNode, name: string) => n.children.find((c) => c.name === name);
const txt = (n: XmlNode | undefined, ...path: string[]): string => {
  let cur = n;
  for (const p of path) cur = cur ? kid(cur, p) : undefined;
  return (cur?.text ?? '').trim();
};
const texts = (n: XmlNode | undefined, ...path: string[]): string[] => {
  if (!n) return [];
  let cur: XmlNode[] = [n];
  for (let i = 0; i < path.length - 1; i++) cur = cur.flatMap((c) => kids(c, path[i]!));
  return cur.flatMap((c) => kids(c, path[path.length - 1]!)).map((c) => c.text.trim()).filter(Boolean);
};
export const num = (v: string) => {
  const m = /-?\d[\d\s ]*(?:[.,]\d+)?/.exec(v);
  return m ? Number(m[0].replace(/[\s ]/g, '').replace(',', '.')) || 0 : 0;
};
/** HTML entities and tags out (Zážitky.cz descriptions carry &nbsp; and the odd <br>), whitespace kept per line. */
export function plain(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
const date = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '');
const https = (u: string) => u.replace(/^http:\/\//i, 'https://');
const okUrl = (u: string) => /^https:\/\/[^\s/]+\.[^\s/]+\//i.test(u);
export function citySlug(s: string): string {
  const t = s.trim();
  if (!t) return '';
  if (/^čr$/i.test(t)) return 'cr';
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function slevomat(n: XmlNode): Item | null {
  const cat1 = txt(n, 'CATEGORY');
  const cats = texts(n, 'CATEGORIES', 'CATEGORY');
  const travel = cat1.includes('Cestování');
  if (!travel && SLEVOMAT_SKIP.some((w) => cat1.includes(w) || (cats[0] ?? '').includes(w))) return null;
  const id = txt(n, 'ID');
  const url = txt(n, 'URL');
  const price = num(txt(n, 'FINAL_PRICE'));
  if (!id || !okUrl(url) || !(price > 0)) return null;
  const old = num(txt(n, 'ORIGINAL_PRICE'));
  const imgs = texts(n, 'IMAGES', 'IMAGE').map(https).filter(okUrl);
  // import 26: root "Cestování" + CATEGORY[2..24]; import 25: CATEGORY[1] as the root + CATEGORY[2..20]
  const map = travel ? SLEVOMAT_TRAVEL_MAP : SLEVOMAT_MAP;
  const path = travel ? ['Cestování', ...cats.slice(1, 24)] : cats.slice(0, 20);
  if (path.length > 1 && path.slice(1).every((c) => SLEVOMAT_GOODS.includes(c))) return null;
  const pv = kid(n, 'PROVIDER') ?? kid(n, 'TRAVEL');
  const pre = kid(n, 'PROVIDER') ? 'PROVIDER_' : 'TRAVEL_';
  const travelNode = kid(n, 'TRAVEL');
  const incl = kid(n, 'PRICE_INCL');
  const info: Info = {
    d: plain(txt(n, 'DESCRIPTION')) || undefined,
    h: plain(txt(n, 'HIGHLIGHTS')) || undefined,
    ts: txt(n, 'TITLE_SHORT') || undefined,
    ve: date(txt(n, 'VOUCHER_END')) || undefined,
    de: date(txt(n, 'DEAL_END')) || undefined,
    cu: num(txt(n, 'CUSTOMERS')) || undefined,
    pr: num(txt(n, 'PRIORITY')) || undefined,
    tags: texts(n, 'TAGS', 'TAG').slice(0, 12),
  };
  if (pv) {
    const p = { t: txt(pv, pre + 'TITLE'), a: txt(pv, pre + 'ADDRESS'), lat: txt(pv, pre + 'GPS_LAT'), lng: txt(pv, pre + 'GPS_LNG') };
    if (p.t || p.a) info.pv = p;
  }
  if (travelNode) {
    info.bo = txt(travelNode, 'BOARD') || undefined;
    info.tr = txt(travelNode, 'TRANSPORT') || undefined;
    info.dp = txt(travelNode, 'DEPARTURE_PLACE') || undefined;
    const ap = texts(travelNode, 'ACCOMMODATION_PARAMS', 'PARAM', 'NAME');
    if (ap.length) info.ap = [...new Set(ap)].slice(0, 40);
    const rv = kid(travelNode, 'ACCOMMODATION_REVIEWS');
    if (rv) { info.ar = num(txt(rv, 'TOTAL_RATING')) || undefined; info.arc = num(txt(rv, 'REVIEW_COUNT')) || undefined; }
  }
  info.cc = txt(n, 'COUNTRY_ID') || undefined;
  info.mx = num(txt(n, 'MAX_CUSTOMERS')) || undefined;
  info.vs = date(txt(n, 'VOUCHER_START')) || undefined;
  if (incl) {
    const items = texts(incl, 'ITEMS', 'ITEM');
    const groups: Array<[string, string[]]> = kids(kid(incl, 'DESCS') ?? { name: '', attrs: {}, children: [], text: '' }, 'GROUP')
      .map((g) => [txt(g, 'NAME'), texts(g, 'DESCS', 'DESC')] as [string, string[]]).filter((g) => g[1].length);
    if (items.length || groups.length) info.in = { ...(items.length ? { i: items } : {}), ...(groups.length ? { g: groups } : {}) };
  }
  return {
    ext: id,
    name: txt(n, 'TITLE'),
    target: affiliateUrl('slevomat', id, url),
    image: imgs[0] ?? '',
    images: imgs.slice(1, 5),
    price,
    priceOld: old > price ? old : 0,
    lok: citySlug(txt(n, 'CITIES', 'CITY')),
    cats: [...path.map((c) => map[c] ?? c), ...(travel ? holidayCats(txt(n, 'COUNTRY_ID') || undefined, info.pv?.a ?? '') : [])],
    // excerpt = HIGHLIGHTS (import 25) / DESCRIPTION (import 26), the Rank Math %excerpt% description
    excerpt: plain(travel ? txt(n, 'DESCRIPTION') : txt(n, 'HIGHLIGHTS')),
    rating: num(txt(n, 'REVIEWS_AVERAGE')),
    reviews: num(txt(n, 'REVIEWS_COUNT')),
    info,
  };
}

function adrop(n: XmlNode): Item | null {
  const ct = txt(n, 'CATEGORYTEXT');
  if (ADROP_SKIP.some((w) => ct.includes(w))) return null;
  const group = txt(n, 'ITEMGROUP_ID');
  const itemId = txt(n, 'ITEM_ID');
  const url = https(txt(n, 'URL'));
  const price = num(txt(n, 'PRICE_VAT'));
  if (!group || !itemId || !okUrl(url) || !(price > 0)) return null;
  const params = kids(n, 'PARAM').map((p) => [txt(p, 'PARAM_NAME'), txt(p, 'VAL')] as [string, string]).filter((p) => p[0] && p[1]);
  const pv = (k: string) => params.find((p) => p[0] === k)?.[1] ?? '';
  const city = pv('Město');
  const imgs = [txt(n, 'IMGURL'), ...texts(n, 'IMGURL_ALTERNATIVE')].map(https).filter(okUrl);
  const old = num(txt(n, 'ADROPPUVCENA'));
  const name = txt(n, 'PRODUCT') || txt(n, 'PRODUCTNAME');
  const target = affiliateUrl('adrop', itemId, txt(n, 'URL'));
  return {
    ext: group,
    name,
    // the URL is appended raw like WP All Import did (data1 = ITEM_ID)
    target,
    image: imgs[0] ?? '',
    images: [...new Set(imgs.slice(1).filter((u) => u !== imgs[0]))].slice(0, 4),
    price,
    priceOld: old > price ? old : 0,
    lok: citySlug(city),
    cats: classify(`${name} ${ct} ${pv('Specifikace')} ${pv('Typ zážitku')}`, undefined, name),
    excerpt: '',
    rating: 0,
    reviews: 0,
    info: { d: plain(txt(n, 'DESCRIPTION')) || undefined, pa: params.filter((p) => !['Lokalita', 'Město', 'Specifikace', 'Doba trvání', 'Počet osob', 'Velikost'].includes(p[0])).slice(0, 8), va: [['', price, target]] },
    vparts: [[city, pv('Specifikace'), pv('Doba trvání'), pv('Počet osob'), pv('Velikost')]],
  };
}

/** Variants of one Adrop group (rows with the same ITEMGROUP_ID) → one list: only the dimensions that differ make the label. */
export function mergeVariants(a: Item, b: Item): Item {
  const best = b.price < a.price ? b : a;
  best.info.va = [...(a.info.va ?? []), ...(b.info.va ?? [])];
  const vp = [...(a.vparts ?? []), ...(b.vparts ?? [])];
  if (vp.length) best.vparts = vp; else delete best.vparts;
  return best;
}
export function finishVariants(it: Item): void {
  const parts = it.vparts;
  delete it.vparts;
  const va = it.info.va;
  if (!parts && va && va.length > 1) {
    // merged tours without dimensions (Rady na cestu terms): one row per label, cheapest first
    const seenL = new Set<string>();
    const uniq = va.filter(([l, pr]) => { const k = l + '|' + pr; if (seenL.has(k)) return false; seenL.add(k); return true; }).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'cs'));
    it.info.va = uniq.length > 1 ? uniq.slice(0, 14) : undefined;
    if (!it.info.va) delete it.info.va;
    return;
  }
  if (!parts || !va || va.length < 2) { if (it.info.va && !parts) return; delete it.info.va; return; }
  const dims = [0, 1, 2, 3, 4].filter((d) => new Set(parts.map((p) => p[d])).size > 1);
  const seen = new Set<string>();
  const out: Array<[string, number, string?]> = [];
  va.forEach(([, pr, t], i) => {
    const label = (dims.map((d) => parts[i]![d]).filter(Boolean).join(' · ')) || `Varianta ${i + 1}`;
    const key = label + '|' + pr;
    if (!seen.has(key)) { seen.add(key); out.push(t ? [label, pr, t] : [label, pr]); }
  });
  out.sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0], 'cs'));
  if (out.length < 2) { delete it.info.va; return; }
  it.info.va = out.slice(0, 80);
  // a group spread over several cities has no single place
  if (new Set(parts.map((p) => p[0]).filter(Boolean)).size > 1) { it.lok = ''; it.city = ''; }
}

const GIFT_TAG = /d[aá]r|v[aá]noc|origin[aá]ln|narozen|svatb|k \d+|cena|v[sš]echny|celoro|promoc|mlad[yý]|d[eě]d|t[rř]ic[aá]tn|nejlep|teenager|ješt[eě]|jihomor|letn[ií]/i;
function zazitky(n: XmlNode): Item | null {
  const id = txt(n, 'ID');
  const url = https(txt(n, 'URL'));
  const name = txt(n, 'PRODUCT');
  const lead = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,:\\s–-]*', 'i');
  const variants = kids(n, 'VARIANT').map((v) => [txt(v, 'PRODUCTNAMEEXT').replace(lead, '').trim() || txt(v, 'PRODUCTNAMEEXT'), num(txt(v, 'PRICE_VAT'))] as [string, number]).filter((v) => v[1] > 0);
  const price = variants.length ? Math.min(...variants.map((v) => v[1])) : num(txt(n, 'PRICE_VAT'));
  if (!id || !okUrl(url) || !(price > 0)) return null;
  const imgs = ['IMGURL', 'IMGURL2', 'IMGURL3', 'IMGURL4', 'IMGURL5'].map((k) => https(txt(n, k))).filter(okUrl);
  const desc = plain(txt(n, 'DESCRIPTION'));
  const tags = [...new Set(texts(n, 'CATEGORYTEXT').flatMap((c) => c.split('|')).map((c) => c.trim()).filter((c) => c && !GIFT_TAG.test(c)))];
  const stay = /\bpobyt|ubytov|\d+ noc|noci\b|nocí\b/i.test(name + ' ' + variants.map((v) => v[0]).join(' '));
  return {
    ext: id,
    name,
    target: affiliateUrl('zazitky', id, txt(n, 'URL')),
    image: imgs[0] ?? '',
    images: imgs.slice(1),
    price,
    priceOld: 0,
    lok: '',
    cats: classify(`${name} ${desc.slice(0, 240)} ${tags.join(' ')}`, stay, name),
    excerpt: '',
    rating: 0,
    reviews: 0,
    info: { d: desc || undefined, va: variants.length > 1 ? variants.sort((x, y) => x[1] - y[1]).slice(0, 30) : undefined, tags: tags.slice(0, 8) },
  };
}


const BOARD: Record<string, string> = { '1': 'bez stravy', '2': 'snídaně', '4': 'polopenze', '5': 'plná penze', '6': 'all inclusive' };
const TRANSPORT: Record<string, string> = { '1': 'vlastní doprava', '4': 'autobus' };
const csDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${y}`; };
const listItems = (html: string) => [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => plain(m[1]!)).filter(Boolean);

/** České kormidlo (SDovolena format): one tour = one offer; the cheapest term is the price, the cheapest term of each month a variant. */
function kormidlo(n: XmlNode): Item | null {
  const id = txt(n, 'tour_id');
  const title = plain(txt(n, 'tour_title'));
  if (!id || !title) return null;
  interface Term { price: number; start: string; id: string; days: number; nights: number; board: string; tr: string; dep: string[] }
  const terms: Term[] = [];
  for (const g of kids(kid(n, 'term_groups') ?? n, 'term_group')) {
    const board = txt(g, 'board', 'id'), tr = txt(g, 'transport', 'id');
    const dep = texts(kid(g, 'dept_places'), 'place');
    for (const t of kids(kid(g, 'terms') ?? g, 'term')) {
      const prices = kids(kid(t, 'prices') ?? t, 'price');
      const adult = prices.find((p) => txt(p, 'age_from') === '0' && txt(p, 'age_to') === '0') ?? prices[0];
      const price = num(txt(adult, 'final_price'));
      const start = date(txt(t, 'start'));
      if (price > 0 && start && txt(t, 'id')) terms.push({ price, start, id: txt(t, 'id'), days: num(txt(t, 'day_count')), nights: num(txt(t, 'night_count')), board, tr, dep });
    }
  }
  if (!terms.length) return null;
  terms.sort((a, b) => a.price - b.price || a.start.localeCompare(b.start));
  const best = terms[0]!;
  const target = (t: Term) => affiliateUrl('kormidlo', t.id, `https://ceskekormidlo.cz/Termin/?ID=${t.id}`);
  // variants: the cheapest term of each month (up to 12), labelled by date, length and what differs (board, transport)
  const byMonth = new Map<string, Term>();
  for (const t of terms) { const k = t.start.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, t); }
  const picked = [...byMonth.values()].sort((a, b) => a.price - b.price || a.start.localeCompare(b.start)).slice(0, 12);
  const boards = new Set(terms.map((t) => t.board)), trs = new Set(terms.map((t) => t.tr));
  const va: Array<[string, number, string]> = picked.map((t) => [
    [csDate(t.start), t.nights ? `${t.nights} ${t.nights === 1 ? 'noc' : t.nights < 5 ? 'noci' : 'nocí'}` : `${t.days} ${t.days === 1 ? 'den' : 'dny'}`, boards.size > 1 ? BOARD[t.board] : '', trs.size > 1 ? TRANSPORT[t.tr] : ''].filter(Boolean).join(' · '),
    t.price, target(t)]);
  const loc = kid(kid(n, 'locations') ?? n, 'location');
  const country = txt(loc, 'country_id'), area = txt(loc, 'area_title'), place = txt(loc, 'place_title');
  const acc = kid(n, 'accommodation');
  const html = txt(n, 'tour_desc');
  const imgs = texts(kid(n, 'photos'), 'photo', 'url').map(https).filter(okUrl);
  const kind = txt(n, 'tour_type');
  const stay = kind !== '200';
  const info: Info = {
    d: plain(html.replace(/<\/(li|h[1-6]|div|ul|ol|p)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')) || undefined,
    pv: { t: txt(acc, 'title') || undefined, a: [place, area].filter(Boolean).join(', ') || undefined, lat: txt(acc, 'gps', 'lat').slice(0, 9) || undefined, lng: txt(acc, 'gps', 'lon').slice(0, 9) || undefined },
    bo: stay ? BOARD[best.board] : undefined,
    tr: TRANSPORT[best.tr],
    dp: [...new Set(best.dep)].slice(0, 6).join(', ') || undefined,
    cc: country || undefined,
    va: va.length > 1 ? va : undefined,
    tags: [txt(acc, 'type')].filter(Boolean),
  };
  const inc = /<h\d[^>]*>\s*Cena zahrnuje\s*<\/h\d>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  const arg = /<div id="argumenty">\s*<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  if (inc) { const i = listItems(inc[1]!); if (i.length) info.in = { i }; }
  if (arg) info.h = listItems(arg[1]!).slice(0, 6).join('\n') || undefined;
  // info.ve stays empty: a tour has many terms
  const where = place && !title.toLowerCase().includes(place.toLowerCase()) ? `${title}, ${place}` : title;
  const cats = kind === '200' ? ['@poznavaci-zajezdy', ...holidayCats(country && country !== 'CZE' ? country : undefined), ...(/advent|vanoc|vánoč/i.test(title) ? ['@vanocni-pobyty'] : /silvestr|nov(y|ý) rok|novoro/i.test(title) ? ['@silvestrovske-pobyty'] : [])]
    : country && country !== 'CZE' ? ['@dovolena-u-more', ...holidayCats(country), ...classify(`${title} ${info.d ?? ''}`.slice(0, 600), true, title).filter((c) => c !== '@pobyty').slice(0, 1)]
    : [...holidayCats(country || 'CZE', area), ...classify(`${title} ${(info.d ?? '').slice(0, 300)}`, true, title)];
  return {
    ext: id, name: where, target: target(best), image: imgs[0] ?? '', images: imgs.slice(1, 7), price: best.price, priceOld: 0,
    lok: country === 'CZE' ? citySlug(place) : '', city: country === 'CZE' ? place : '', cats, excerpt: '', rating: 0, reviews: 0, info,
  };
}

/** Words SHOUTED in a title ("… + UNIVERZITNÍ OXFORD + …") → normal case: a proper name keeps its capital (or an acronym its
 *  capitals) when the description writes it so mid-sentence, the first word of each " + " part starts with a capital. */
export function uncaps(title: string, context: string): string {
  const UP = /^[\p{Lu}\d.-]*\p{Lu}[\p{Lu}\d.-]*$/u;
  return title.split(/(\s*\+\s*)/).map((part, pi) => {
    if (pi % 2) return part;
    return part.split(/(\s+)/).map((w, wi) => {
      const core = w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
      if (core.length === 1 && wi > 0 && /^[VZKSOUAI]$/.test(core)) return w.replace(core, core.toLowerCase()); // shouted preposition
      if (core.length < 2 || !UP.test(core)) return w;
      const cap = core.charAt(0) + core.slice(1).toLocaleLowerCase('cs');
      const re = (x: string) => new RegExp(`(^|[^\\p{L}])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');
      const out = core.length <= 4 && re(core).test(context) ? core : new RegExp(`[^.!?\\s"„] ${cap.length > 4 ? cap.slice(0, -2) : cap}`, 'u').test(context) || wi === 0 ? cap : core.toLocaleLowerCase('cs');
      return w.replace(core, out);
    }).join('');
  }).join('');
}

/** Rady na cestu (SDovolena format, no namespace): tours with the same detail page (variants A, B, C…) are one offer; the terms are its variants. */
function radynacestu(n: XmlNode): Item | null {
  const detail = https(txt(n, 'tour_detail_url'));
  const title = plain(txt(n, 'tour_title'));
  const slug = detail.replace(/\/+$/, '').split('/').pop() ?? '';
  if (!slug || !okUrl(detail) || !title) return null;
  // the same tour has a page per transport / departure (…-letecky-z-prahy, …-autobusem): one offer per title
  const group = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
  const RTR: Record<string, string> = { '2': 'letecky', '0': 'letecky', '4': 'autobusem' };
  const kind = txt(n, 'tour_type');
  interface T { price: number; start: string; days: number; nights: number; url: string; tr: string; board: string; dep: string[] }
  const terms: T[] = [];
  const incl: string[] = [], excl: string[] = [];
  for (const g of kids(kid(n, 'term_groups') ?? n, 'term_group')) {
    const board = txt(g, 'board', 'id'), tr = txt(g, 'transport', 'id');
    const dep = texts(kid(g, 'dept_places'), 'place');
    incl.push(...texts(kid(g, 'price_incl'), 'item', 'desc').map(plain));
    excl.push(...texts(kid(g, 'price_excl'), 'item', 'desc').map(plain));
    for (const t of kids(kid(g, 'terms') ?? g, 'term')) {
      const prices = kids(kid(t, 'prices') ?? t, 'price');
      const adult = prices.find((p) => txt(p, 'age_from') === '0' && txt(p, 'age_to') === '0') ?? prices[0];
      const price = num(txt(adult, 'final_price')), start = date(txt(t, 'start')), url = https(txt(t, 'purchase_url')) || detail;
      if (price > 0 && start) terms.push({ price, start, days: num(txt(t, 'day_count')), nights: num(txt(t, 'night_count')), url, tr, board, dep });
    }
  }
  if (!terms.length) return null;
  terms.sort((a, b) => a.price - b.price || a.start.localeCompare(b.start));
  const best = terms[0]!;
  const target = (t: T) => affiliateUrl('radynacestu', slug, t.url);
  const byMonth = new Map<string, T>();
  for (const t of terms) { const k = t.start.slice(0, 7) + t.tr + t.url.split('/').slice(-3)[0]; if (!byMonth.has(k)) byMonth.set(k, t); }
  const va: Array<[string, number, string]> = [...byMonth.values()].map((t) => [
    [csDate(t.start), t.nights ? `${t.nights} ${t.nights === 1 ? 'noc' : t.nights < 5 ? 'noci' : 'nocí'}` : `${t.days} ${t.days === 1 ? 'den' : 'dny'}`, RTR[t.tr] ?? ''].filter(Boolean).join(' · '),
    t.price, target(t)]);
  const countries = [...new Set(texts(kid(n, 'locations'), 'location', 'country_id'))];
  const cc = countries[0] ?? '';
  const imgs = texts(kid(n, 'photos'), 'photo', 'url').map(https).filter(okUrl);
  const acc = kid(n, 'accommodation');
  const days: Array<[string, string[]]> = [];
  const prog = kids(kid(kid(n, 'program') ?? n, 'tour_program') ?? n, 'day');
  if (prog.length) days.push(['Program zájezdu', prog.slice(0, 14).map((d) => `${plain(txt(d, 'title'))}: ${plain(txt(d, 'desc').replace(/<\/(p|li|div)>/gi, ' ')).replace(/\n+/g, ' ').slice(0, 380)}`)]);
  if (excl.length) days.push(['Cena nezahrnuje', [...new Set(excl)].slice(0, 10)]);
  const lead = plain(txt(n, 'tour_desc'));
  const info: Info = {
    d: lead || undefined, h: lead ? lead.split(/(?<=[.!?])\s/)[0] : undefined,
    pv: { t: txt(acc, 'title') || undefined },
    tr: best.tr === '4' ? 'autobus' : best.tr === '2' || best.tr === '0' ? 'letecky' : undefined,
    bo: BOARD[best.board], dp: [...new Set(best.dep)].slice(0, 6).join(', ') || undefined, cc: cc || undefined,
    in: { ...([...new Set(incl)].length ? { i: [...new Set(incl)].slice(0, 14) } : {}), ...(days.length ? { g: days } : {}) },
    va, tags: countries.slice(0, 4),
  };
  if (!info.in?.i && !info.in?.g) delete info.in;
  const cats = kind === '200' || kind === '500' ? ['@poznavaci-zajezdy', ...holidayCats(cc && cc !== 'CZE' ? cc : undefined)] : ['@dovolena-u-more', ...holidayCats(cc && cc !== 'CZE' ? cc : undefined)];
  const ctx = [lead, ...prog.map((d) => plain(txt(d, 'desc')))].join(' ');
  return { ext: group || slug, name: uncaps(title.replace(/\s+/g, ' '), ctx), target: target(best), image: imgs[0] ?? '', images: imgs.slice(1, 7), price: best.price, priceOld: 0, lok: '', cats, excerpt: '', rating: 0, reviews: 0, info };
}

const COMP_ACC: Record<string, string> = { 'liga mistrů': 'Ligu mistrů', 'evropská liga': 'Evropskou ligu', 'konferenční liga': 'Konferenční ligu', 'liga národů': 'Ligu národů' };
const LEAGUES = new Set(['Premier League', 'Serie A', 'La Liga', 'Bundesliga', 'Ligue 1', 'Eredivisie', 'Coppa Italia', 'FA Cup', 'Carabao Cup']);
/** SEO name of a FutbalTour trip: "Liga mistrů: FC Barcelona - Aston Villa" → "Zájezd na Ligu mistrů: FC Barcelona – Aston Villa (21. 10. 2026)". */
export function sportTitle(raw: string, sport: string, league: string, iso: string): string {
  const t = plain(raw).replace(/\s+/g, ' ').trim().replace(/\s+[-–]\s+/g, ' – ');
  const when = iso && !/\d{1,2}\. ?\d{1,2}\. ?\d{4}/.test(t) ? `, ${csDate(iso)}` : '';
  if (/^zájezd/i.test(t)) return t + when;
  const lowFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const m = t.match(/^([^:]+):\s*(.+ – .+)$/);
  if (m && COMP_ACC[m[1]!.toLowerCase()]) return `Zájezd na ${COMP_ACC[m[1]!.toLowerCase()]}: ${m[2]}${when}`;
  if (m && /^(NHL|NBA|NFL)\b/.test(m[1]!)) return `Zájezd na ${m[1]}: ${m[2]}${when}`;
  if (m && sport !== 'Hokej') return `Zájezd na zápas ${m[1]}: ${m[2]}${when}`;
  if (/^[^:]+ – [^:]+$/.test(t)) return `Zájezd na zápas ${t}${LEAGUES.has(league) ? ` (${league})` : ''}${when}`;
  if (/^F1 Speciál/i.test(t)) return `Zájezd F1 Speciál: ${t.replace(/^F1 Speciál:?\s*/i, '')}${when}`;
  if (/^F1\b/.test(t)) return `Zájezd na Formuli 1: ${t.replace(/^F1:?\s*/i, '')}${when}`;
  if (/^(Semi)?finále/i.test(t)) return `Zájezd na ${lowFirst(t)}${when}`;
  if (/^(maraton|půlmaraton)/i.test(t)) return `Zájezd na ${lowFirst(t)}${when}`;
  if (sport === 'Tenis') return `Zájezd na tenis: ${t.replace(/^Tenis:\s*/i, '')}${when}`;
  if (sport === 'Hokej') return `Hokejový zájezd: ${t}${when}`;
  return `Zájezd: ${t}${when}`;
}

/** The feed's own image_link is a generated banner with the event text across the whole picture; sport stock photos (Pexels, hot-linked through wsrv) replace it. */
const SPORT_PHOTOS: Record<string, string[]> = {
 "Fotbal": [
  "https://images.pexels.com/photos/30651230/pexels-photo-30651230.jpeg",
  "https://images.pexels.com/photos/32190714/pexels-photo-32190714.jpeg",
  "https://images.pexels.com/photos/29557630/pexels-photo-29557630.jpeg",
  "https://images.pexels.com/photos/33210166/pexels-photo-33210166.jpeg"
 ],
 "Hokej": [
  "https://images.pexels.com/photos/6469035/pexels-photo-6469035.jpeg",
  "https://images.pexels.com/photos/6468744/pexels-photo-6468744.jpeg",
  "https://images.pexels.com/photos/6847284/pexels-photo-6847284.jpeg"
 ],
 "Formule 1": [
  "https://images.pexels.com/photos/28680795/pexels-photo-28680795.jpeg",
  "https://images.pexels.com/photos/38041837/pexels-photo-38041837.jpeg",
  "https://images.pexels.com/photos/10373654/pexels-photo-10373654.jpeg"
 ],
 "Basketbal": [
  "https://images.pexels.com/photos/34688570/pexels-photo-34688570.jpeg",
  "https://images.pexels.com/photos/16599399/pexels-photo-16599399.jpeg"
 ],
 "Tenis": [
  "https://images.pexels.com/photos/27151849/pexels-photo-27151849.jpeg",
  "https://images.pexels.com/photos/36765778/pexels-photo-36765778.jpeg"
 ],
 "Maratony a půlmaratony": [
  "https://images.pexels.com/photos/10313668/pexels-photo-10313668.jpeg",
  "https://images.pexels.com/photos/2654902/pexels-photo-2654902.jpeg"
 ],
 "Americký fotbal": [
  "https://images.pexels.com/photos/274517/pexels-photo-274517.jpeg",
  "https://images.pexels.com/photos/274577/pexels-photo-274577.jpeg"
 ],
 "Moto GP": [
  "https://images.pexels.com/photos/38374472/pexels-photo-38374472.jpeg",
  "https://images.pexels.com/photos/5713150/pexels-photo-5713150.jpeg"
 ],
 "Šipky": [
  "https://images.pexels.com/photos/226573/pexels-photo-226573.jpeg"
 ],
 "Box": [
  "https://images.pexels.com/photos/28238742/pexels-photo-28238742.jpeg"
 ],
 "Ostatní sporty a akce": [
  "https://images.pexels.com/photos/40317576/pexels-photo-40317576.jpeg",
  "https://images.pexels.com/photos/35898730/pexels-photo-35898730.jpeg"
 ]
};
const sportPhoto = (sport: string, id: string): string => {
  const l = SPORT_PHOTOS[sport] ?? SPORT_PHOTOS['Ostatní sporty a akce']!;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return l[h % l.length]!;
};

/** FutbalTour (Google Merchant RSS via Mergado, eHub deep links): tickets + travel to football, hockey, F1 … events. */
function futbaltour(n: XmlNode): Item | null {
  const id = txt(n, 'id');
  const url = https(txt(n, 'link'));
  const price = num(txt(n, 'price'));
  const raw = txt(n, 'title');
  const image = https(txt(n, 'image_link'));
  if (!id || !raw || !okUrl(url) || !okUrl(image) || !(price > 0)) return null;
  const sport = txt(n, 'custom_label_0');
  const [, league = ''] = txt(n, 'product_type').split(' - ').map((x) => x.trim());
  const ev = txt(n, 'event_date').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = ev ? `${ev[3]}-${ev[2]!.padStart(2, '0')}-${ev[1]!.padStart(2, '0')}` : '';
  const place = txt(n, 'custom_label_1');
  const city = place.split(',')[0]!.trim();
  const desc = plain(txt(n, 'description')).split('\n').map((x) => x.trim()).filter((x) => x && !/^FutbalTour x|^Autorizovaný prodejce vstupenek/i.test(x));
  const sub = sport === 'Fotbal' ? 'zajezdy-na-fotbal' : sport === 'Hokej' ? 'zajezdy-na-hokej' : sport === 'Formule 1' ? 'zajezdy-na-formuli-1' : 'ostatni-sportovni-zajezdy';
  const pa: Array<[string, string]> = [['Sport', sport], ...(league ? [['Soutěž', league] as [string, string]] : []), ...(iso ? [['Termín', csDate(iso)] as [string, string]] : []), ...(place ? [['Místo', place] as [string, string]] : [])];
  return {
    ext: id,
    name: sportTitle(raw, sport, league, iso),
    target: affiliateUrl('futbaltour', id, url),
    image: sportPhoto(sport, id),
    images: [],
    price,
    priceOld: 0,
    lok: citySlug(city),
    city,
    cats: ['@sportovni-zajezdy', '@' + sub],
    excerpt: '',
    rating: 0,
    reviews: 0,
    info: { d: desc.join('\n') || undefined, pv: { t: 'FutbalTour' }, pa, tags: [sport, league].filter(Boolean), ...(iso ? { de: iso } : {}) },
  };
}

/** SkvěléČesko.cz (Google Merchant Atom feed, deep links through Dognet): one entry = one bookable activity. */
function skvelecesko(n: XmlNode): Item | null {
  const id = txt(n, 'id');
  const url = https(txt(n, 'link'));
  const price = num(txt(n, 'price'));
  const title = plain(txt(n, 'title'));
  if (!id || !okUrl(url) || !(price > 0) || !title) return null;
  const imgs = [txt(n, 'image_link'), ...texts(n, 'additional_image_link')].map(https).filter(okUrl);
  const type = txt(n, 'product_type');
  const city = txt(n, 'custom_label_0');
  const provider = title.includes(' - ') ? title.split(' - ')[0]!.trim() : '';
  const target = affiliateUrl('skvelecesko', id, url);
  // the same activity is listed once per city (and per branch): one offer, the places are its variants
  const group = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
  return {
    ext: group || id,
    name: title,
    target,
    image: imgs[0] ?? '',
    images: imgs.slice(1, 7),
    price,
    priceOld: 0,
    lok: citySlug(city),
    city,
    cats: classify(`${title} ${type}`, false, title),
    excerpt: '',
    rating: 0,
    reviews: 0,
    info: { d: plain(txt(n, 'description')) || undefined, pv: provider ? { t: provider } : undefined, tags: type ? [type] : undefined, va: [[city, price, target]] },
    vparts: [[city]],
  };
}

export function parseItem(src: Source, n: XmlNode): Item | null {
  const it = src === 'slevomat' ? slevomat(n) : src === 'adrop' ? adrop(n) : src === 'skvelecesko' ? skvelecesko(n) : src === 'kormidlo' ? kormidlo(n) : src === 'radynacestu' ? radynacestu(n) : src === 'futbaltour' ? futbaltour(n) : zazitky(n);
  if (!it || !it.name || !it.image) return null; // no photo = nothing to show (dead tours, empty entries)
  // generic gift vouchers ("Dárkový poukaz na zážitek", "Univerzální poukaz…") are not an offer — only services are listed
  if ((src === 'adrop' || src === 'zazitky') && /^(univerz\w*|dárkov\w* (poukaz|voucher|certifik\w*))/i.test(it.name.trim())) return null;
  if (!it.excerpt) it.excerpt = (it.info.d ?? '').split('\n')[0]!.slice(0, 300);
  return it;
}

/** FNV-1a over everything that is stored (a changed hash = one UPDATE). */
export function itemHash(i: Item): string {
  const s = JSON.stringify([i.name, i.target, i.image, i.images, i.price, i.priceOld, i.lok, i.cats, i.excerpt, i.rating, i.reviews, i.info, ...(i.city ? [i.city] : [])]);
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
