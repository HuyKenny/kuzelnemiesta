// Holiday geography (categories "Dovolená v <stát>" and "Dovolená v <kraj>"): the country comes from the feed
// (Slevomat COUNTRY_ID / SDovolena country_id, ISO alpha-3), a Czech region from the postcode of the address or the
// feed's own region name. The PSČ table is by the first digits — good for a landing page, not a cadastre (border towns can be off).

/** country → category slug (only countries with enough offers have a category: kategorie-nove.json) */
export const COUNTRY_CAT: Record<string, string> = {
  ITA: 'dovolena-italie', HRV: 'dovolena-chorvatsko', POL: 'dovolena-polsko', AUT: 'dovolena-rakousko', SVK: 'dovolena-slovensko',
  HUN: 'dovolena-madarsko', SVN: 'dovolena-slovinsko', DEU: 'dovolena-nemecko',
};

const REGION = ['praha', 'stredocesky', 'jihocesky', 'plzensky', 'karlovarsky', 'ustecky', 'liberecky', 'hradecky', 'pardubicky', 'vysocina', 'jihomoravsky', 'olomoucky', 'zlinsky', 'moravskoslezsky'] as const;
export type Region = (typeof REGION)[number];
const slug = (r: Region) => 'dovolena-' + (r === 'praha' || r === 'vysocina' ? r : r + '-kraj');

const P2: Record<string, Region> = {
  '10': 'praha', '11': 'praha', '12': 'praha', '13': 'praha', '14': 'praha', '15': 'praha', '16': 'praha', '17': 'praha', '18': 'praha', '19': 'praha',
  '25': 'stredocesky', '26': 'stredocesky', '27': 'stredocesky', '28': 'stredocesky', '29': 'stredocesky',
  '30': 'plzensky', '31': 'plzensky', '32': 'plzensky', '33': 'plzensky', '34': 'plzensky', '35': 'karlovarsky', '36': 'karlovarsky',
  '37': 'jihocesky', '38': 'jihocesky', '39': 'jihocesky',
  '40': 'ustecky', '41': 'ustecky', '42': 'ustecky', '43': 'ustecky', '44': 'ustecky', '45': 'ustecky', '46': 'liberecky', '47': 'liberecky',
  '50': 'hradecky', '51': 'hradecky', '52': 'hradecky', '53': 'pardubicky', '54': 'hradecky', '55': 'hradecky', '56': 'pardubicky', '57': 'pardubicky',
  '58': 'vysocina', '59': 'vysocina',
  '60': 'jihomoravsky', '61': 'jihomoravsky', '62': 'jihomoravsky', '63': 'jihomoravsky', '64': 'jihomoravsky', '65': 'jihomoravsky', '66': 'jihomoravsky',
  '67': 'jihomoravsky', '68': 'jihomoravsky', '69': 'jihomoravsky',
  '70': 'moravskoslezsky', '71': 'moravskoslezsky', '72': 'moravskoslezsky', '73': 'moravskoslezsky', '74': 'moravskoslezsky',
  '75': 'olomoucky', '76': 'zlinsky', '77': 'olomoucky', '78': 'olomoucky', '79': 'olomoucky',
};
const P3: Record<string, Region> = {
  '393': 'vysocina', '394': 'vysocina', '395': 'vysocina', '396': 'vysocina',
  '511': 'liberecky', '512': 'liberecky', '513': 'liberecky', '514': 'liberecky',
  '674': 'vysocina', '675': 'vysocina', '676': 'vysocina',
  '686': 'zlinsky', '687': 'zlinsky', '688': 'zlinsky',
  '755': 'zlinsky', '756': 'zlinsky', '757': 'zlinsky', '758': 'zlinsky', '759': 'zlinsky',
  '792': 'moravskoslezsky', '793': 'moravskoslezsky', '794': 'moravskoslezsky', '795': 'moravskoslezsky',
};
const NAMES: Array<[RegExp, Region]> = [
  [/praha/i, 'praha'], [/st[rř]edo[cč]esk/i, 'stredocesky'], [/jiho[cč]esk/i, 'jihocesky'], [/plze[nň]sk/i, 'plzensky'], [/karlovarsk/i, 'karlovarsky'],
  [/[uú]steck/i, 'ustecky'], [/libereck/i, 'liberecky'], [/kr[aá]lov[eé]hradeck/i, 'hradecky'], [/pardubick/i, 'pardubicky'], [/vyso[cč]in/i, 'vysocina'],
  [/jihomoravsk/i, 'jihomoravsky'], [/olomouck/i, 'olomoucky'], [/zl[ií]nsk/i, 'zlinsky'], [/moravskoslezsk/i, 'moravskoslezsky'],
];

/** Czech region category slug from a region name ("Středočeský kraj") or the postcode closing an address ("Chotoviny, 391 37"). */
export function czRegion(addressOrName: string): string {
  const named = NAMES.find(([re]) => re.test(addressOrName));
  if (named) return slug(named[1]);
  const m = /(\d{3})\s?(\d{2})\s*$/.exec(addressOrName.trim());
  if (!m) return '';
  const r = P3[m[1]!] ?? P2[m[1]!.slice(0, 2)];
  return r ? slug(r) : '';
}

/** Category slugs ("@slug") of a holiday offer: its country, for Czechia "Dovolená v Česku" and the region. */
export function holidayCats(cc: string | undefined, addressOrRegion = ''): string[] {
  if (!cc) return [];
  if (cc === 'CZE') { const r = czRegion(addressOrRegion); return ['@dovolena-v-cesku', ...(r ? ['@' + r] : [])]; }
  const c = COUNTRY_CAT[cc];
  return c ? ['@' + c] : [];
}
