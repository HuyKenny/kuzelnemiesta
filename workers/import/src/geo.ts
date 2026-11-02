// Holiday geography (categories "Dovolenka v <štát>" and "Dovolenka v <kraj>"): the country comes from the feed
// (Zlavomat COUNTRY_ID, ISO alpha-3), a Slovak region from the postcode closing the address ("…, Pribylina, 032 42").
// The PSČ table goes by the first three digits — good for a landing page, not a cadastre (border towns can be off).

/** country → category slug (only countries with enough offers have a category: kategorie-nove.json) */
export const COUNTRY_CAT: Record<string, string> = {
  CZE: 'dovolenka-v-cesku', ITA: 'dovolenka-v-taliansku', HRV: 'dovolenka-v-chorvatsku', POL: 'dovolenka-v-polsku', AUT: 'dovolenka-v-rakusku',
  HUN: 'dovolenka-v-madarsku', SVN: 'dovolenka-v-slovinsku', DEU: 'dovolenka-v-nemecku',
};

const REGION = ['bratislavsky', 'trnavsky', 'trenciansky', 'nitriansky', 'zilinsky', 'banskobystricky', 'presovsky', 'kosicky'] as const;
export type Region = (typeof REGION)[number];
export const regionSlug = (r: Region) => `dovolenka-${r}-kraj`;

/** First three digits of the PSČ → region (ranges, Slovak post 2026). */
const RANGES: Array<[number, number, Region]> = [
  [10, 13, 'zilinsky'], [14, 14, 'zilinsky'], [15, 21, 'trenciansky'], [22, 39, 'zilinsky'],
  [40, 51, 'kosicky'], [52, 57, 'kosicky'], [58, 70, 'presovsky'], [71, 79, 'kosicky'], [80, 99, 'presovsky'],
  [800, 904, 'bratislavsky'], [905, 910, 'trnavsky'], [911, 916, 'trenciansky'], [917, 926, 'trnavsky'], [927, 928, 'nitriansky'],
  [929, 933, 'trnavsky'], [934, 956, 'nitriansky'], [957, 958, 'trenciansky'], [959, 970, 'banskobystricky'], [971, 972, 'trenciansky'],
  [973, 999, 'banskobystricky'],
];
const NAMES: Array<[RegExp, Region]> = [
  [/bratislavsk/i, 'bratislavsky'], [/trnavsk/i, 'trnavsky'], [/tren[cč]iansk/i, 'trenciansky'], [/nitriansk/i, 'nitriansky'],
  [/[zž]ilinsk/i, 'zilinsky'], [/banskobystrick/i, 'banskobystricky'], [/pre[sš]ovsk/i, 'presovsky'], [/ko[sš]ick/i, 'kosicky'],
];

/** Slovak region category slug from a region name ("Žilinský kraj") or the postcode closing an address. */
export function skRegion(addressOrName: string): string {
  const named = NAMES.find(([re]) => re.test(addressOrName));
  if (named) return regionSlug(named[1]);
  const m = /(\d{3})[\s ]?(\d{2})\s*$/.exec(addressOrName.trim());
  if (!m) return '';
  const p3 = Number(m[1]);
  // 0xx codes (north and east) by their first three digits 010–099, 8xx/9xx (south-west) as they are
  const r = RANGES.find(([a, b]) => p3 >= a && p3 <= b);
  return r ? regionSlug(r[2]) : '';
}

/** Category slugs ("@slug") of a holiday offer: its country, for Slovakia "Dovolenka na Slovensku" and the region. */
export function holidayCats(cc: string | undefined, addressOrRegion = ''): string[] {
  if (!cc) return [];
  if (cc === 'SVK') { const r = skRegion(addressOrRegion); return ['@dovolenka-na-slovensku', ...(r ? ['@' + r] : [])]; }
  const c = COUNTRY_CAT[cc];
  return c ? ['@' + c] : [];
}
