// Formatting helpers shared by templates (Slovak typography: non-breaking spaces in numbers and before "€").
import { LOCALE } from './site';

export const NBSP = '\u00a0';

/** The home country: Zlavomat sells every trip in the sales city "SR" (→ "Slovensko"); abroad the country of the offer is the real place. */
export const HOME_COUNTRY = 'Slovensko';
const COUNTRY: Record<string, string> = {
  POL: 'Poľsko', SVK: 'Slovensko', CZE: 'Česko', AUT: 'Rakúsko', HUN: 'Maďarsko', ITA: 'Taliansko', DEU: 'Nemecko', HRV: 'Chorvátsko', SVN: 'Slovinsko',
  ESP: 'Španielsko', ALB: 'Albánsko', BRA: 'Brazília', NLD: 'Holandsko', SWE: 'Švédsko', MNE: 'Čierna Hora', GRC: 'Grécko', FRA: 'Francúzsko',
  EGY: 'Egypt', TUR: 'Turecko', BGR: 'Bulharsko', PRT: 'Portugalsko', CHE: 'Švajčiarsko', GBR: 'Veľká Británia', CYP: 'Cyprus', MLT: 'Malta', TUN: 'Tunisko',
  ROU: 'Rumunsko', SRB: 'Srbsko', BIH: 'Bosna a Hercegovina', MKD: 'Severné Macedónsko', BEL: 'Belgicko', DNK: 'Dánsko', NOR: 'Nórsko', IRL: 'Írsko',
  ISL: 'Island', MAR: 'Maroko', ARE: 'Spojené arabské emiráty', THA: 'Thajsko', MDV: 'Maldivy', LKA: 'Srí Lanka', DOM: 'Dominikánska republika', MEX: 'Mexiko', CUB: 'Kuba',
};
export function place(city: string | null | undefined, cc: string | null | undefined): string {
  const c = city ?? '';
  return c === HOME_COUNTRY && cc && cc !== 'SVK' ? COUNTRY[cc] ?? '' : c;
}

/** Whole number with non-breaking thousands separators (counts). */
export function cislo(n: number | string | null | undefined): string {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
/** Price in euros, Slovak format: "24,90 €", whole amounts without cents ("25 €"), "1 290 €". */
export function cena(n: number | string | null | undefined): string {
  const cents = Math.round((Number(n) || 0) * 100);
  const whole = cislo(Math.trunc(cents / 100));
  const frac = Math.abs(cents % 100);
  return (frac ? `${whole},${String(frac).padStart(2, '0')}` : whole) + NBSP + '€';
}
/** Number in the site locale (decimals kept), for places that are not prices. */
export const num = (n: number) => n.toLocaleString(LOCALE).replace(/\s/g, NBSP);

/** 1 ponuka, 2–4 ponuky, 5+ ponúk */
export function ponuk(n: number): string {
  return n === 1 ? 'ponuka' : n >= 2 && n <= 4 ? 'ponuky' : 'ponúk';
}
/** "1 overená ponuka", "3 overené ponuky", "120 overených ponúk" (count first) */
export function overenych(n: number): string {
  return `${cislo(n)} ${n === 1 ? 'overená ponuka' : n >= 2 && n <= 4 ? 'overené ponuky' : 'overených ponúk'}`;
}
/** 1 tip, 2–4 tipy, 5+ tipov */
export function tipov(n: number): string {
  return n === 1 ? 'tip' : n >= 2 && n <= 4 ? 'tipy' : 'tipov';
}
/** 1 produkt, 2–4 produkty, 5+ produktov */
export function produktu(n: number): string {
  return n === 1 ? 'produkt' : n >= 2 && n <= 4 ? 'produkty' : 'produktov';
}
export function eshopu(n: number): string {
  return n === 1 ? 'e-shopu' : 'e-shopov';
}
export function datum(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : '';
}
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Decode the HTML entities WordPress leaves in titles (&#8211; …) for plain-text contexts. */
export function decode(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, NBSP).replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
/** wp_strip_all_tags + whitespace collapse (what Rank Math does for %excerpt% / %term_description%). */
export function stripTags(html: string | null | undefined): string {
  return decode(String(html ?? '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
/** Plain text cut at a word boundary (cards, blog listing). Rank Math descriptions are NOT cut — use stripTags. */
export function excerpt(html: string | null | undefined, max = 160): string {
  const t = stripTags(html);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > 80 ? cut.slice(0, i) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '');
}

/** Subset of WordPress wptexturize() for displayed titles (Slovak/Czech quotes „…“, en dash, ellipsis, apostrophe). Rank Math
 *  titles/descriptions use the raw text, H1 and listings the texturized one — both are kept so parity holds. */
export function texturize(s: string): string {
  return s
    .replace(/(\d)''/g, '$1“').replace(/(\d)"/g, '$1″').replace(/(\d)x(\d)/g, '$1×$2')
    .replace(/(^|[\s(\[])"(?=\S)/g, '$1„').replace(/"/g, '“')
    .replace(/(\d)'(?=\s|$)/g, '$1′').replace(/(\d)'/g, '$1’')
    .replace(/(\w)'(\w)/g, '$1’$2').replace(/(\w)'(?=\s)/g, '$1‘')
    .replace(/ - /g, ' – ').replace(/ -- /g, ' — ')
    .replace(/\.\.\./g, '…');
}

/** Comment HTML from WordPress (originally visitor input): only p, br, b/strong, i/em and plain http(s) links survive. */
export function safeCommentHtml(html: string): string {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, name: string, attrs: string) => {
      const n = name.toLowerCase();
      const close = tag.startsWith('</');
      if (['p', 'br', 'b', 'strong', 'i', 'em'].includes(n)) return close ? `</${n}>` : `<${n}>`;
      if (n === 'a') {
        if (close) return '</a>';
        const href = /href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i.exec(attrs)?.[1];
        return href ? `<a href="${esc(decode(href))}" rel="nofollow ugc noopener" target="_blank">` : '<a>';
      }
      return '';
    });
}

/** Days left until a YYYY-MM-DD date (deal end), null when unknown or past. */
export function dniDo(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const d = Math.ceil((Date.parse(date.slice(0, 10) + 'T23:59:59Z') - Date.now()) / 86400_000);
  return d >= 0 ? d : null;
}
/** dnes, zajtra, o 2 dni, o 5 dní */
export function dni(n: number): string {
  return n === 0 ? 'dnes' : n === 1 ? 'zajtra' : n <= 4 ? `o ${n} dni` : `o ${n} dní`;
}
