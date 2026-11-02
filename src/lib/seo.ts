// Titles, descriptions and robots (the Rank Math templates + child theme filters of the Czech sister site, translated):
//   offer      "{name} | Kúzelné miesta"                      description = excerpt (Rank Math %excerpt%)
//   category   "{name} – N ponúk od X € | Kúzelné miesta" (≤ 62 chars, else shorter variants)
//   city       "Zážitky a pobyty {lok} | Kúzelné miesta"
//   combo      "{cat} {lok} | Kúzelné miesta"
//   store, blog category "{term} | Kúzelné miesta"            post/page: the stored snapshot (seo_title)
import { cena, cislo, decode, HOME_COUNTRY, overenych, ponuk, stripTags } from './format';
import { SITE_NAME } from './site';

export const SITE = SITE_NAME;
const SEP = ' | ';

export const withSite = (t: string) => decode(t) + SEP + SITE;

/** mb_substr( 0, 157 ) . '…' when longer than 160 (the theme's descriptions). */
export function cut160(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? t.slice(0, 157) + '…' : t;
}
/** Rank Math %excerpt% / %term_description%: plain text, cut at a word boundary around 160 characters. */
export function clamp(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cutAt = t.slice(0, max + 1);
  const i = cutAt.lastIndexOf(' ');
  return (i > max * 0.6 ? cutAt.slice(0, i) : t.slice(0, max)).replace(/[\s,;:–(-]+$/, '') + '…';
}

/** First title that fits the SERP (about 62 characters). */
const fit = (cands: string[], max = 62) => cands.find((t) => t.length <= max) ?? cands[cands.length - 1]!;
const eur = (n: number) => cena(n);
const YEAR = () => new Date().getFullYear();

/** Category: the keyword first, then what the searcher gets (count, from-price), the year for freshness, the brand last. */
export function categoryTitle(name: string, count = 0, min = 0): string {
  const n = decode(name);
  return fit([
    count && min ? `${n} ${YEAR()} – ${cislo(count)} ${ponuk(count)} od ${eur(min)}${SEP}${SITE}` : '',
    count && min ? `${n} – ${cislo(count)} ${ponuk(count)} od ${eur(min)}${SEP}${SITE}` : '',
    min ? `${n} od ${eur(min)}${SEP}${SITE}` : '',
    `${n} – ponuky a vouchery${SEP}${SITE}`,
    `${n}${SEP}${SITE}`,
  ].filter(Boolean));
}
export function categoryDesc(name: string, count: number, min = 0): string {
  const n = decode(name);
  return cut160(`${n}: ${overenych(count)}${min ? ` od ${eur(min)}` : ''}. Porovnajte ceny a hodnotenia, voucher príde hneď e-mailom – ideálny aj ako darček.`);
}
export const cityTitle = (lok: string) => fit([`Zážitky a pobyty ${lok} – vouchery a darčeky${SEP}${SITE}`, `Zážitky a pobyty ${lok}${SEP}${SITE}`]);
export const cityDesc = (nom: string, count: number) => cut160(`${nom}: ${overenych(count)} na zážitky, pobyty a wellness. Porovnajte ceny a vyberte si tú pravú, voucher príde hneď e-mailom.`);
export const comboTitle = (cat: string, lok: string, count = 0) => fit([count ? `${decode(cat)} ${lok} – ${cislo(count)} ${ponuk(count)}${SEP}${SITE}` : '', `${decode(cat)} ${lok}${SEP}${SITE}`].filter(Boolean));
export const comboDesc = (cat: string, lok: string, count: number) => cut160(`${decode(cat)} ${lok}: ${overenych(count)}. Porovnajte ceny aj hodnotenia a vyberte si tú pravú, voucher príde hneď e-mailom.`);

/** Cuts a long offer name at the last natural break (" – ", ": ", ", ", then a word) within `max` characters. */
// Slovak words a cut title must not end on (a dangling conjunction or preposition reads like an error in the SERP)
const DANGLING = /\s+(a|aj|alebo|i|s|so|v|vo|na|do|z|zo|k|ku|pre|pri|po|od|za|o|u|ako|či|alebo|vrátane|\+|&|–|-)$/i;
function shorten(name: string, max: number): string {
  const t = decode(name).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const br = Math.max(head.lastIndexOf(' – '), head.lastIndexOf(': '), head.lastIndexOf(', '), head.lastIndexOf(' - '));
  const i = br > max * 0.55 ? br : head.lastIndexOf(' ');
  let out = t.slice(0, i > 0 ? i : max).replace(/[\s,;:–-]+$/, '');
  for (let k = 0; k < 3 && DANGLING.test(out); k++) out = out.replace(DANGLING, '').replace(/[\s,;:–-]+$/, '');
  return out;
}
/** "Bratislava" is already in "… v Bratislave" (Slovak declension): compare the first 5 letters of every word of the place. */
function mentions(text: string, place: string): boolean {
  const norm = (x: string) => x.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = norm(text);
  return norm(place).split(/[\s-]+/).filter((w) => w.length > 2).every((w) => t.includes(w.slice(0, Math.min(5, Math.max(3, w.length - 2)))));
}
/** Offer: "{short name}, {place} – od 79 € | Kúzelné miesta" (the custom Rank Math title of an old WordPress page wins). */
export function productTitle(name: string, short: string, where: string, price: number, custom = '', from = false, unit = ''): string {
  if (custom) return rmVars(custom, name);
  const base = decode(short || name);
  const place = where && where !== HOME_COUNTRY && !mentions(base, where) ? `, ${where}` : '';
  const pr = price > 0 ? ` – ${from || unit ? 'od ' : ''}${eur(price)}${unit ? '/' + unit.replace(/^za /, '') : ''}` : '';
  for (const b of [base + place, base]) {
    const t = `${b}${pr}${SEP}${SITE}`;
    if (t.length <= 62) return t;
    if (`${b}${pr}`.length <= 62) return `${b}${pr}`;
  }
  return `${shorten(base, 62 - pr.length)}${pr}`;
}
/** Offer description ≤ ~158 characters: what it is, where, the price, why now. */
export function productDesc(custom: string, name: string, lead: string, where: string, price: number, voucher = true, unit = ''): string {
  if (custom) return custom;
  const first = stripTags(lead.split('\n').map((x) => x.trim().replace(/\.$/, '')).filter(Boolean).slice(0, 3).join(', ')).replace(/\s+/g, ' ').trim();
  const tail = voucher ? 'Voucher ihneď e-mailom.' : 'Rezervácia online.';
  const head = `${shorten(name, 70)}${where && where !== HOME_COUNTRY && !mentions(name, where) ? ` (${where})` : ''}`.replace(/[.!?]+$/, '') + '.';
  const pr = price > 0 ? ` Cena od ${eur(price)}${unit ? ' ' + unit : ''}.` : '';
  const room = 158 - head.length - pr.length - tail.length - 2;
  // a lead cut mid-sentence ends with an ellipsis, a whole one with its full stop — never ".."
  const cut = first ? shorten(first, room - 1) : '';
  const lead2 = first && room > 30 ? ` ${cut}${cut.length < first.length ? '…' : '.'}`.replace(/[.,;:]+(…|\.)$/, '$1') : '';
  return `${head}${lead2}${pr} ${tail}`.replace(/\s+/g, ' ').trim();
}
/** Article title for the SERP: whole when it fits, else cut at a natural break (titles of the old blog run 90–115 chars). */
export function postTitle(name: string): string {
  const full = withSite(name);
  if (full.length <= 62) return full;
  const room = 62 - SEP.length - SITE.length;
  const t = decode(name).replace(/\s+/g, ' ').trim();
  const colon = t.search(/[:?!]/);
  const head = colon > 15 && colon <= room ? t.slice(0, colon) : shorten(t, room);
  return head + SEP + SITE;
}
export const BLOG_TITLE = `Blog: tipy na cestovanie, zážitky a dovolenku${SEP}${SITE}`;
export const BLOG_DESC = 'Inšpirácia a praktické tipy na cestovanie, zážitky, wellness a dovolenku. Nápady na darčeky aj rady, ako vybrať ten správny pobyt alebo zážitok.';

/** Rank Math per-object template with %title%/%term%/%sep%/%sitename% filled. */
export function rmVars(tpl: string, name: string): string {
  return tpl.replace(/%(title|term)%/g, decode(name)).replace(/%sep%/g, '|').replace(/%sitename%/g, SITE).replace(/%currentyear%/g, String(new Date().getFullYear()))
    .replace(/%[a-z_]+%/g, '').replace(/\s{2,}/g, ' ').trim();
}
export function offerTitle(name: string, custom = ''): string {
  return custom ? rmVars(custom, name) : withSite(name);
}
/** Rank Math %excerpt%: whole when it (about) fits, else cut at the last word before 160 characters, no ellipsis. */
export function rmExcerpt(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 165) return t;
  const c = t.slice(0, 161);
  const i = c.lastIndexOf(' ');
  return (i > 100 ? c.slice(0, i) : t.slice(0, 160)).replace(/[\s,;:–-]+$/, '');
}
export function descFrom(custom: string, text: string, fallback = ''): string {
  if (custom) return custom;
  return rmExcerpt(stripTags(text) || fallback);
}
/** " – strana N" on paged listings (Rank Math %page%). */
export function paged(title: string, page: number): string {
  return page > 1 ? title.replace(new RegExp(`(\\s*\\|\\s*${SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?$`), ` – strana ${page}$1`) : title;
}

/** Rank Math robots meta: follow/nofollow, index/noindex, the object's extra flags, max-* defaults on indexable pages. */
export function robots(noindex: boolean, extra = ''): string[] {
  const parts = extra.split(',').map((x) => x.trim()).filter(Boolean);
  const flags = parts.filter((x) => !['index', 'noindex', 'follow', 'nofollow'].includes(x) && !x.startsWith('max-'));
  const head = [parts.includes('nofollow') ? 'nofollow' : 'follow', noindex ? 'noindex' : 'index', ...flags];
  return noindex ? head : [...head, 'max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large'];
}
