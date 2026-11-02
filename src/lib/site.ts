// Site-wide constants and the JSON-LD base graph (Organization/WebSite as Rank Math printed them on kouzelnydeda.cz,
// with the knowledge-graph name fixed to "Kouzelný děda" — WordPress once said "Kúzelné miesta").
export const BASE = 'https://kouzelnydeda.cz';
export const SITE_NAME = 'Kouzelný děda';
export const SITE_DESC = 'Vyhledávač pobytů a dovolené';
export const GA4_ID = 'G-6SEWKKB1YH';
export const INDEXNOW_KEY = 'b44e9e81085a8e09ad851279ee1b8ce8';
export const LOGO_URL = BASE + '/a/logo-512.png';
export const OG_DEFAULT = BASE + '/a/og.jpg';
export const PER_PAGE = 24;
export const POSTS_PER_PAGE = 12;
/** kd_combo: a category × city listing with at least this many offers is its own landing page (canonical to itself). */
export const COMBO_MIN = 40;
/** Smaller towns and football cities (FutbalTour trips) get their landings from fewer offers. */
export const COMBO_MIN_EXTRA = 15;
const EXTRA = new Set(['london', 'manchester', 'roma', 'madrid', 'barcelona', 'milano', 'liverpool', 'napoli', 'turin', 'most', 'decin', 'opava', 'cesky-krumlov', 'pribram']);
export const comboMin = (city: string) => (EXTRA.has(city) ? COMBO_MIN_EXTRA : COMBO_MIN);
/** Days an ended offer keeps its page ("Nabídka skončila", noindex) before it 301s to its category. */
export const EXPIRED_KEEP_DAYS = 30;
/** Operator (same as the legal pages). */
export const OPERATOR = { name: 'Ha Duy Huy', ico: '07876823', ds: 'dxmsrdt', street: 'Bartáková 36', zip: '140 00', city: 'Praha', email: 'info@kouzelnydeda.cz' };

export function orgGraph(searchAction = false): unknown[] {
  return [
    {
      '@type': 'Organization', '@id': BASE + '/#organization', name: SITE_NAME, url: BASE,
      logo: { '@type': 'ImageObject', '@id': BASE + '/#logo', url: LOGO_URL, contentUrl: LOGO_URL, caption: SITE_NAME, inLanguage: 'cs', width: '512', height: '168' },
    },
    {
      '@type': 'WebSite', '@id': BASE + '/#website', url: BASE, name: SITE_NAME, description: SITE_DESC, publisher: { '@id': BASE + '/#organization' }, inLanguage: 'cs',
      ...(searchAction ? { potentialAction: { '@type': 'SearchAction', target: BASE + '/?s={search_term_string}&post_type=product', 'query-input': 'required name=search_term_string' } } : {}),
    },
  ];
}

/** D1 keeps WordPress' local (Europe/Prague) dates → W3C datetime with the Prague offset. */
export function isoPrague(local: string): string {
  const s = String(local || '').replace(' ', 'T').slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return '';
  const d = new Date(s + 'Z');
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = /GMT([+-])(\d{1,2})/.exec(name);
  const off = m ? `${m[1]}${m[2]!.padStart(2, '0')}:00` : '+01:00';
  return s + off;
}
