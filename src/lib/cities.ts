// kd_city_map() of the WordPress child theme: pa_lokalita slug → [nominative, locative]. Shared by the site and the importer.
export const CITY: Record<string, [string, string]> = {
  cr: ['Česko', 'v Česku'],
  praha: ['Praha', 'v Praze'],
  brno: ['Brno', 'v Brně'],
  ostrava: ['Ostrava', 'v Ostravě'],
  plzen: ['Plzeň', 'v Plzni'],
  'ceske-budejovice': ['České Budějovice', 'v Českých Budějovicích'],
  'usti-nad-labem': ['Ústí nad Labem', 'v Ústí nad Labem'],
  'hradec-kralove': ['Hradec Králové', 'v Hradci Králové'],
  olomouc: ['Olomouc', 'v Olomouci'],
  liberec: ['Liberec', 'v Liberci'],
  pardubice: ['Pardubice', 'v Pardubicích'],
  zlin: ['Zlín', 've Zlíně'],
  'karlovy-vary': ['Karlovy Vary', 'v Karlových Varech'],
  jihlava: ['Jihlava', 'v Jihlavě'],
  london: ['Londýn', 'v Londýně'],
  manchester: ['Manchester', 'v Manchesteru'],
  roma: ['Řím', 've Římě'],
  madrid: ['Madrid', 'v Madridu'],
  barcelona: ['Barcelona', 'v Barceloně'],
  milano: ['Milán', 'v Miláně'],
  liverpool: ['Liverpool', 'v Liverpoolu'],
  napoli: ['Neapol', 'v Neapoli'],
  turin: ['Turín', 'v Turíně'],
  most: ['Most', 'v Mostě'],
  decin: ['Děčín', 'v Děčíně'],
  opava: ['Opava', 'v Opavě'],
  'cesky-krumlov': ['Český Krumlov', 'v Českém Krumlově'],
  pribram: ['Příbram', 'v Příbrami'],
};

/** Unknown slug: words capitalised, "v …" (the theme's fallback). */
export function cityName(slug: string): { nom: string; lok: string; known: boolean } {
  const c = CITY[slug];
  if (c) return { nom: c[0], lok: c[1], known: true };
  const n = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { nom: n, lok: 'v ' + n, known: false };
}
