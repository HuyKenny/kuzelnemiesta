// Location slug (ASCII, from the feed's sales city) → [nominative, locative]. Shared by the site and the importer.
/** The whole of Slovakia (Zlavomat sales city "SR"): never a city landing of its own. */
export const HOME_LOK = 'sr';
export const CITY: Record<string, [string, string]> = {
  sr: ['Slovensko', 'na Slovensku'],
  bratislava: ['Bratislava', 'v Bratislave'],
  kosice: ['Košice', 'v Košiciach'],
  zilina: ['Žilina', 'v Žiline'],
  presov: ['Prešov', 'v Prešove'],
  'banska-bystrica': ['Banská Bystrica', 'v Banskej Bystrici'],
  nitra: ['Nitra', 'v Nitre'],
  trnava: ['Trnava', 'v Trnave'],
  trencin: ['Trenčín', 'v Trenčíne'],
  poprad: ['Poprad', 'v Poprade'],
  piestany: ['Piešťany', 'v Piešťanoch'],
  martin: ['Martin', 'v Martine'],
  'vysoke-tatry': ['Vysoké Tatry', 'vo Vysokých Tatrách'],
  'nizke-tatry': ['Nízke Tatry', 'v Nízkych Tatrách'],
  'liptovsky-mikulas': ['Liptovský Mikuláš', 'v Liptovskom Mikuláši'],
  ruzomberok: ['Ružomberok', 'v Ružomberku'],
  zvolen: ['Zvolen', 'vo Zvolene'],
  'spisska-nova-ves': ['Spišská Nová Ves', 'v Spišskej Novej Vsi'],
  bardejov: ['Bardejov', 'v Bardejove'],
  michalovce: ['Michalovce', 'v Michalovciach'],
  komarno: ['Komárno', 'v Komárne'],
  'nove-zamky': ['Nové Zámky', 'v Nových Zámkoch'],
  'dunajska-streda': ['Dunajská Streda', 'v Dunajskej Strede'],
  'velky-meder': ['Veľký Meder', 'vo Veľkom Mederi'],
  senec: ['Senec', 'v Senci'],
  prievidza: ['Prievidza', 'v Prievidzi'],
  bojnice: ['Bojnice', 'v Bojniciach'],
  'trencianske-teplice': ['Trenčianske Teplice', 'v Trenčianskych Tepliciach'],
  'rajecke-teplice': ['Rajecké Teplice', 'v Rajeckých Tepliciach'],
  // abroad (trips and city breaks)
  praha: ['Praha', 'v Prahe'],
  brno: ['Brno', 'v Brne'],
  vieden: ['Viedeň', 'vo Viedni'],
  budapest: ['Budapešť', 'v Budapešti'],
  london: ['Londýn', 'v Londýne'],
  manchester: ['Manchester', 'v Manchestri'],
  roma: ['Rím', 'v Ríme'],
  madrid: ['Madrid', 'v Madride'],
  barcelona: ['Barcelona', 'v Barcelone'],
  milano: ['Miláno', 'v Miláne'],
  liverpool: ['Liverpool', 'v Liverpoole'],
  napoli: ['Neapol', 'v Neapole'],
  turin: ['Turín', 'v Turíne'],
  paris: ['Paríž', 'v Paríži'],
  munchen: ['Mníchov', 'v Mníchove'],
  dortmund: ['Dortmund', 'v Dortmunde'],
  amsterdam: ['Amsterdam', 'v Amsterdame'],
  lisabon: ['Lisabon', 'v Lisabone'],
};

/** Feed spellings of the same city (FutbalTour writes Slovak names, Zľavomat English/Italian ones) → one slug, one URL. */
export const CITY_ALIAS: Record<string, string> = {
  londyn: 'london', milan: 'milano', rim: 'roma', neapol: 'napoli', pariz: 'paris', mnichov: 'munchen', viden: 'vieden', wien: 'vieden',
  budapest: 'budapest', budapesti: 'budapest', prague: 'praha', torino: 'turin',
};
/** A city gets an indexable landing page only when it is a known place with enough offers (audit 2. 11. 2026: 139 of 166
 *  feed place names were raw strings like "Cela Sr" or one-offer cities). */
export const CITY_INDEX_MIN = 15;

/** Unknown slug: words capitalised, "v …" (the theme's fallback). */
export function cityName(slug: string): { nom: string; lok: string; known: boolean } {
  const c = CITY[slug];
  if (c) return { nom: c[0], lok: c[1], known: true };
  const n = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { nom: n, lok: 'v ' + n, known: false };
}
