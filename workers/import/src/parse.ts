// One feed element → a normalised offer, with the same filters, fields and categories as the WP All Import templates
// of kuzelnemiesta.sk (imports 7/8 Zlavomat, 10 Adrop). Everything the detail page shows goes into `info` (compact JSON).
import type { XmlNode } from './xml/stream';
import { ADROP_SKIP, SK_TERMS, ZLAVOMAT_GOODS, ZLAVOMAT_MAP, ZLAVOMAT_SKIP, ZLAVOMAT_TRAVEL_MAP, affiliateUrl, type Source } from './feeds';
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
  if (/^(čr|sr)$/i.test(t)) return 'sr';
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function zlavomat(n: XmlNode): Item | null {
  const cat1 = txt(n, 'CATEGORY');
  const cats = texts(n, 'CATEGORIES', 'CATEGORY');
  const travel = cat1.includes('Cestovanie');
  if (!travel && ZLAVOMAT_SKIP.some((w) => cat1.includes(w) || (cats[0] ?? '').includes(w))) return null;
  const id = txt(n, 'ID');
  const url = txt(n, 'URL');
  const price = num(txt(n, 'FINAL_PRICE'));
  if (!id || !okUrl(url) || !(price > 0)) return null;
  const old = num(txt(n, 'ORIGINAL_PRICE'));
  const imgs = texts(n, 'IMAGES', 'IMAGE').map(https).filter(okUrl);
  // travel: root "Cestovanie" + CATEGORY[2..24]; otherwise CATEGORY[1] as the root + CATEGORY[2..20]
  const map = travel ? ZLAVOMAT_TRAVEL_MAP : ZLAVOMAT_MAP;
  const path = travel ? ['Cestovanie', ...cats.slice(1, 24)] : cats.slice(0, 20);
  if (path.length > 1 && path.slice(1).every((c) => ZLAVOMAT_GOODS.includes(c))) return null;
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
    const sk = (v: string) => SK_TERMS[v.toLowerCase()] ?? v;
    info.bo = sk(txt(travelNode, 'BOARD')) || undefined;
    info.tr = sk(txt(travelNode, 'TRANSPORT')) || undefined;
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
    target: affiliateUrl('zlavomat', id, url),
    image: imgs[0] ?? '',
    images: imgs.slice(1, 5),
    price,
    priceOld: old > price ? old : 0,
    lok: citySlug(txt(n, 'CITIES', 'CITY')),
    // the old SK tree lacks many of Zlavomat's newer subcategories (Escape Room, Vyhliadkové lety …) → the name classifier adds
    // the specific node for everything that is not a stay
    cats: [...path.map((c) => map[c] ?? c), ...(travel ? holidayCats(txt(n, 'COUNTRY_ID') || undefined, info.pv?.a ?? '') : classify(`${txt(n, 'TITLE')} ${cats.join(' ')}`, false, txt(n, 'TITLE')))],
    // excerpt = HIGHLIGHTS (experiences) / DESCRIPTION (travel), the Rank Math %excerpt% description
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
  const city = pv('Město') || pv('Mesto');
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
    const uniq = va.filter(([l, pr]) => { const k = l + '|' + pr; if (seenL.has(k)) return false; seenL.add(k); return true; }).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'sk'));
    it.info.va = uniq.length > 1 ? uniq.slice(0, 14) : undefined;
    if (!it.info.va) delete it.info.va;
    return;
  }
  if (!parts || !va || va.length < 2) { if (it.info.va && !parts) return; delete it.info.va; return; }
  const dims = [0, 1, 2, 3, 4].filter((d) => new Set(parts.map((p) => p[d])).size > 1);
  const seen = new Set<string>();
  const out: Array<[string, number, string?]> = [];
  va.forEach(([, pr, t], i) => {
    const label = (dims.map((d) => parts[i]![d]).filter(Boolean).join(' · ')) || `Variant ${i + 1}`;
    const key = label + '|' + pr;
    if (!seen.has(key)) { seen.add(key); out.push(t ? [label, pr, t] : [label, pr]); }
  });
  out.sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0], 'sk'));
  if (out.length < 2) { delete it.info.va; return; }
  it.info.va = out.slice(0, 80);
  // a group spread over several cities has no single place
  if (new Set(parts.map((p) => p[0]).filter(Boolean)).size > 1) { it.lok = ''; it.city = ''; }
}

export function parseItem(src: Source, n: XmlNode): Item | null {
  const it = src === 'zlavomat' ? zlavomat(n) : adrop(n);
  if (!it || !it.name || !it.image) return null; // no photo = nothing to show
  // generic gift vouchers ("Darčekový poukaz na zážitok", "Univerzálny poukaz…") are not an offer — only services are listed
  if (src === 'adrop' && /^(univerz\w*|dárkov\w* (poukaz|voucher|certifik\w*)|darčekov\w* (poukaz|poukážk\w*|voucher|certifik\w*))/i.test(it.name.trim())) return null;
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
