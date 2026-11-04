// Site-wide constants and the JSON-LD base graph. kuzelnemiesta.sk = fork of kouzelnydeda.cz (2. 11. 2026): every brand,
// domain, language and currency value lives here — nothing else may hardcode them.
export const BASE = 'https://kuzelnemiesta.sk';
export const HOST = 'kuzelnemiesta.sk';
export const SITE_NAME = 'Kúzelné miesta';
export const SITE_DESC = 'Zážitky, pobyty a wellness so zľavou na jednom mieste';
export const LANG = 'sk';
export const LOCALE = 'sk-SK';
export const OG_LOCALE = 'sk_SK';
export const CURRENCY = 'EUR';
export const GA4_ID = 'G-2LK65CD4WF';
export const INDEXNOW_KEY = 'f194c6344953d22301e0f0eb78e1b88d';
export const LOGO_URL = BASE + '/a/logo-512.png';
export const OG_DEFAULT = BASE + '/a/og.jpg';
export const PER_PAGE = 24;
export const POSTS_PER_PAGE = 12;
/** kd_combo: a category × city listing with at least this many offers is its own landing page (canonical to itself). */
export const COMBO_MIN = 40;
/** Smaller Slovak towns get their landings from fewer offers. */
export const COMBO_MIN_EXTRA = 15;
// smaller Slovak towns and the cities of FutbalTour's football trips
const EXTRA = new Set(['bratislava', 'kosice', 'trnava', 'trencin', 'nitra', 'banska-bystrica', 'presov', 'zilina', 'poprad', 'piestany', 'martin',
  'london', 'manchester', 'liverpool', 'milano', 'roma', 'madrid', 'barcelona', 'munchen', 'dortmund', 'paris', 'napoli', 'turin']);
export const comboMin = (city: string) => (EXTRA.has(city) ? COMBO_MIN_EXTRA : COMBO_MIN);
/** A category with fewer active offers is thin: reachable, but noindex and out of the sitemap (SEO audit 2. 11. 2026). */
export const THIN_CAT = 5;
/** Categories with real search demand (Marketing Miner SK, 3. 11. 2026) stay indexable from the first offer: they carry
 *  their own text, and a noindex would hand the query to adrop.sk / najzazitky.sk for good. */
export const INDEX_DEMAND = new Set(['paragliding', 'bungee-jumping', 'skola-smyku', 'veterny-tunel-a-volny-pad', 'let-vrtulnikom', 'zimne-sporty',
  'lety-balonom', 'jazda-v-lamborghini', 'tandemovy-zoskok', 'husacie-hody', 'ajurveda', 'wellness-pobyty-s-detmi', 'bardejovske-kupele',
  'kupele-bojnice', 'kupele-rajecke-teplice', 'kupele-turcianske-teplice', 'kupele-trencianske-teplice']);
export const isThin = (slug: string, count: number) => (INDEX_DEMAND.has(slug) ? count < 1 : count < THIN_CAT);
/** Days an ended offer keeps its page ("Ponuka skončila", noindex) before it 301s to its category. */
export const EXPIRED_KEEP_DAYS = 30;
/** Operator (same as the legal pages). */
export const OPERATOR = { name: 'Ha Duy Huy', ico: '07876823', ds: 'dxmsrdt', street: 'Bartáková 36', zip: '140 00', city: 'Praha', email: 'info@kuzelnemiesta.sk' };

/** Founder (Kenny's personal site huy.cz is the Person entity; same node on all his projects). */
export const FOUNDER = { '@type': 'Person', '@id': 'https://huy.cz/#kenny', name: 'Ha Duy Huy', alternateName: 'Kenny', url: 'https://huy.cz/', jobTitle: 'SEO konzultant' };

export function orgGraph(searchAction = false): unknown[] {
  return [
    {
      '@type': 'Organization', '@id': BASE + '/#organization', name: SITE_NAME, url: BASE,
      logo: { '@type': 'ImageObject', '@id': BASE + '/#logo', url: LOGO_URL, contentUrl: LOGO_URL, caption: SITE_NAME, inLanguage: LANG, width: '715', height: '168' },
      founder: FOUNDER,
    },
    {
      '@type': 'WebSite', '@id': BASE + '/#website', url: BASE, name: SITE_NAME, description: SITE_DESC, publisher: { '@id': BASE + '/#organization' }, inLanguage: LANG,
      ...(searchAction ? { potentialAction: { '@type': 'SearchAction', target: BASE + '/?s={search_term_string}', 'query-input': 'required name=search_term_string' } } : {}),
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
