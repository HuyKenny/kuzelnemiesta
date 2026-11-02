// Keyword classifier for feeds that carry no usable category tree (Zážitky.cz lists gift-landing tags, Adrop a flat
// type, SkvěléČesko a product type). Returns slugs of the category tree ("@slug", see engine.resolveCats): the most
// specific match first, at most two, the section as the fallback.
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STAY: Array<[RegExp, string]> = [
  [/glamping|jurt[aouy]|kupol|maringotk|tiny ?house|treehouse|posed|bublin|stan(ovy|u)\b/, 'glamping'],
  [/hausbot|vodni domek|domek na vode|netradicn/, 'netradicni-ubytovani'],
  [/lazn|termal|spa pobyt|rehabilit/, 'lazenske-pobyty'],
  [/wellness|sauna|virivk|privatni zon|masaz/, 'wellness-pobyty'],
  [/romantick|pro dva|pro pary|pro paru|svatebni noc/, 'pobyty-pro-dva'],
  [/gurman|vinar|degustac|vinn[ye]|pivn[ye]/, 'gurmanske-pobyty'],
  [/hory|horach|lyz|snezk|sumav|krkonos|jeseni[kc]|beskyd/, 'pobyty-na-horach'],
  [/rodin|s detmi|pro deti/, 'rodinne-pobyty'],
  [/se psem|pes\b|mazlicek/, 'dovolena-se-psem'],
  [/silvestr/, 'silvestrovske-pobyty'], [/vanoc|advent/, 'vanocni-pobyty'], [/velikonoc/, 'velikonocni-pobyty'], [/valentyn/, 'valentynske-pobyty'],
  [/vikend/, 'vikendove-pobyty'],
  [/cyklo|kolo|golf|aktivn|rybar|jezdeck/, 'aktivni-dovolena'],
  [/chat[ayu]|chalup/, 'chaty-a-chalupy'], [/penzion/, 'penziony'], [/zamek|zamku|luxus|chateau/, 'luxusni-hotely'],
];

const EXP: Array<[RegExp, string]> = [
  [/\bkino\b|kina\b|divadl|predstaven|koncert|cirkus|mjuzikl|opera\b|vstupenk\w* na/, 'kultura-a-vylety'],
  [/\bbalon/, 'lety-balonem'],
  [/vyhlidkov\w* let|vrtulnik|paraglid|tandem|seskok|vetron|letoun|letadl|\blet\b|\blety\b|dron|vzdusn/, 'vyhlidkove-lety'],
  [/simulator|virtualni realit|\bvr\b/, 'virtualni-realita'],
  [/unikov\w* hr|escape/, 'unikove-hry'],
  [/paintball|laser ?game|laser tag|lasergame/, 'paintball-a-laser-game'],
  [/airsoft|strelb|strelni|zbran|kulomet|kurz strel/, 'strelba'],
  [/motokar|\bkart/, 'motokary'],
  [/okruh|formul|supercar|ferrari|lamborghini|porsche|spolujizd|driftov|offroad|ctyrkol|buggy|\btank|monster|jizd\w* v |zazitkov\w* jizd|rizeni (auta|vozu|kamion|bagr|tank)/, 'zazitkove-jizdy'],
  [/bungee|zip ?line|lanov|lezeck|horolez|via ferrat|skok z|stezka v korunach/, 'lanova-centra'],
  [/raft|kanoe|kanu\b|paddle|\blod[ei]|plavb|jacht|kajak|vodni|potap|diving|surf|vodak|jetski|vodni skútr/, 'vodni-zazitky'],
  [/teambuilding|skupinov|firemni/, 'teambuilding'],
  [/bowling|biliard|dartu|zabavni centrum|detsk\w* zabavni|trampolin/, 'bowling-a-zabava'],
  [/masaz/, 'masaze'],
  [/solna jeskyn|solna/, 'solna-jeskyne'],
  [/sauna|wellness|virivk|infrasauna|lazne|termal|bazen|floating|flotac/, 'sauna'],
  [/kosmet|osetreni pleti|lifting|liceni|oboci|\brasy\b|epilac|depilac|botox|laser\w* (odstran|vlas)/, 'kosmetika'],
  [/manikur|pedikur|nehty|gelov/, 'manikura-a-pedikura'],
  [/kadernic|barber|strih|holeni/, 'kadernictvi-a-barber'],
  [/hubnut|tvarovan|kryolip|cellulit|pressoterap/, 'hubnuti-a-tvarovani'],
  [/kurz\w* (vareni|peceni)|vareni|peceni|cukrar|barista/, 'kurzy-vareni'],
  [/kurz\w* (malovan|kresl)|malovan|kresleni|malirsk/, 'kurzy-malovani'],
  [/kurz\w* foceni|fotografovan|workshop foto/, 'kurzy-foceni'],
  [/keramik|hrncir|tvoreni|vyrob|rezbar|sklo|kovar|svicek|mydl|workshop/, 'diy-kurzy'],
  [/tanecn|tanec|salsa|zumba/, 'sportovni-kurzy'],
  [/jazykov|anglick|nemeck|kurz\w* jazyk/, 'jazykove-kurzy'],
  [/degustac|vinarstv|pivovar|whisk|\bgin\b|\brum\b|ochutnavk|sommelier|barmansk/, 'degustace-vina-a-piva'],
  [/\bkone\b|konsk|jezdec|hippo|jizd\w* na koni/, 'jizda-na-koni'],
  [/zoo\b|safari|zviratk|krmeni|alpak|lam[ay]|sokoln/, 'zoo-a-zviratka'],
  [/aquapark|zabavni park|dino ?park|lanovk/, 'zabavni-parky'],
  [/muzeum|vystav|galerie|hrad\b|zamek|prohlidk|pamatk|jeskyn/, 'muzea-a-pamatky'],
  [/venkovni hr|city ?quest|pohadkov|lov pokladu|geocach|stezka/, 'venkovni-hry'],
  [/pujcovn|pronajem|vypujc|elektrokol|koloběž|kolobez/, 'pujcovny'],
  [/snowkit|lyzar|snowboard|bruslen|zimni sport|lyzovan/, 'zimni-sporty'],
  [/cviceni|posilovn|fitness|yoga|joga|pilates|crossfit|trenink|\bbox\b/, 'cviceni-a-fitness'],
  [/foceni|fotoateli|fotograf/, 'foceni'],
  [/dets|pro deti|deti\b/, 'zazitky-pro-deti'],
  [/adrenalin|extremn/, 'adrenalinove-zazitky'],
  [/striptyz|erotick/, 'striptyz'],
];

/** Series with their own hub category, added to whatever the source's own tree says (any source: Slevomat's categories are mapped separately).
 *  Third field: also applies to stay offers (a hotel that merely mentions a minigolf or an ATV must not land in that series). */
const SERIES: Array<[RegExp, string, boolean]> = [
  [/cirkus|cirkusu/, 'cirkus', true],
  [/head ?spa/, 'head-spa', true],
  [/ferrari/, 'jizda-ve-ferrari', false],
  [/lamborghini/, 'jizda-v-lamborghini', false],
  [/porsche|porshe/, 'jizda-v-porsche', false],
  [/mustang/, 'jizda-ve-fordu-mustang', false],
  [/dodge|challenger|hellcat/, 'jizda-v-dodge', false],
  [/\btatr(a|ou|u) ?\d{3}|\btatrou\b/, 'jizda-tatrou', false],
  [/bugin|buggy|ctyrkol|\batv\b|offroad|off-road|4x4/, 'bugiiny-a-ctyrkolky', false],
  [/seskok|skydiv|volneho padu/, 'tandemovy-seskok', false],
  [/paraglid/, 'paragliding', false],
  [/vzducholod/, 'let-vzducholodi', false],
  [/vetrn\w* tunel|windtunnel/, 'vetrny-tunel-a-volny-pad', false],
  [/ferrat/, 'via-ferrata-zazitky', false],
  [/jetpack|hoverboard|flyboard/, 'flyboarding-a-jetpack', false],
  [/potap|freediving|diving/, 'potapeni', false],
  [/lukostrel/, 'lukostrelba-kurzy', false],
  [/minigolf/, 'minigolf', false],
  [/hospodsky kviz|pub ?quiz|\bkviz\b/, 'hospodsky-kviz', false],
  [/pivni (lazn|koupel|spa|wellness)/, 'pivni-lazne', true],
  [/privatni (wellness|spa|sauna|virivk)|soukrom\w* (wellness|spa|sauna|virivk)/, 'privatni-wellness', true],
  [/tanecn|taneni|\btanec\b|\btance\b|salsa|bachata|zumba/, 'tanecni-kurzy', false],
  [/\bkoz[aeouy]\b|kozami|kozou|alpak|oslik/, 'prochazka-s-kozou-a-alpakami', false],
  [/premier league|carabao|fa cup/, 'zajezdy-na-premier-league', false],
  [/serie a|coppa italia/, 'zajezdy-na-serii-a', false],
  [/la liga/, 'zajezdy-na-la-ligu', false],
  [/bundesliga/, 'zajezdy-na-bundesligu', false],
  [/ligue 1/, 'zajezdy-na-ligue-1', false],
  [/liga mistru|ligu mistru|champions league/, 'zajezdy-na-ligu-mistru', false],
  [/evropsk\w+ lig|europa league/, 'zajezdy-na-evropskou-ligu', false],
  [/\bnhl\b/, 'zajezdy-na-nhl', false],
  [/mistrovstvi sveta v hokeji|ms v hokeji/, 'zajezdy-na-ms-v-hokeji', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bliverpool\b)/, 'vstupenky-liverpool', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:manchester united)/, 'vstupenky-manchester-united', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:manchester city)/, 'vstupenky-manchester-city', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\barsenal\b)/, 'vstupenky-arsenal', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bchelsea\b)/, 'vstupenky-chelsea', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\btottenham\b)/, 'vstupenky-tottenham', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:fc barcelona)/, 'vstupenky-fc-barcelona', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:real madrid)/, 'vstupenky-real-madrid', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:atletico madrid)/, 'vstupenky-atletico-madrid', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:b\. ?mnichov|bayern)/, 'vstupenky-bayern-mnichov', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:dortmund)/, 'vstupenky-borussia-dortmund', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bjuventus\b)/, 'vstupenky-juventus', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:inter milan)/, 'vstupenky-inter-milan', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:ac milan)/, 'vstupenky-ac-milan', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:neapol|napoli)/, 'vstupenky-ssc-neapol', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:as rim)/, 'vstupenky-as-rim', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:lazio)/, 'vstupenky-lazio-rim', false],
  [/^(?=.*(zapas|ligu mistru|evropsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bpariz\b|\bpsg\b|paris saint)/, 'vstupenky-paris-saint-germain', false],
  [/bungee|bunge\w* jump|skok z (jerabu|mostu)/, 'bungee-jumping', false],
  [/skol\w* smyku|\bsmyk\b|driftov\w* (kurz|skol)|bezpecn\w* jizd/, 'kurzy-smyku-a-bezpecne-jizdy', false],
  [/\bl-?39\b|albatros|stihack/, 'let-stihackou', false],
  [/romantick\w* (pobyt|vikend|noc|ubytovani|wellness|dovolena|escape)/, 'romanticke-pobyty', true],
  [/zamek|zamku|zamecke|zamecky|chateau/, 'pobyty-na-zamku', true],
  [/rybar|rybol|rybolov|rybni/, 'rybareni', false],
  [/romantick\w* vecer|vecer\w* (pro dva|pri svick)/, 'romanticka-vecere', false],
  [/rozluck/, 'rozlucka-se-svobodou', true],
  [/(pokoj|apartma|chata|chatka|domek)\w* s (soukromou |privatni )?virivk|virivk\w* (na|v) pokoj/, 'pokoje-s-virivkou', true],
  [/v oblacich|dinner in the sky/, 'vecere-v-oblacich', false],
  [/preziti|survival|bushcraft/, 'kurzy-preziti', false],
  [/barist|latte art|kurz o kave/, 'kurzy-baristy', false],
  [/vrtulnik/, 'let-vrtulnikem', false],
  [/letecky simulator|simulator (letadl|letu|boeing)|boeing|airbus|cessna/, 'letecke-simulatory', false],
  [/sumav|lipno|zelezn\w* ruda/, 'pobyty-na-sumave', true],
  [/krkonos|harrachov|spindler|pec pod snezkou|janske lazne|rokytnice|vrchlabi/, 'pobyty-v-krkonosich', true],
  [/jeseni[kc]|karlova studanka|ramzova|jesenik/, 'pobyty-v-jesenikach', true],
  [/beskyd|radhost|frenstat|ostravice|bumbalka/, 'pobyty-v-beskydech', true],
  [/mikulov|lednice|valtice|palava|pavlov\b/, 'pobyty-v-mikulove', true],
  [/all inclusive|ultra all|\bal\b inclusive/, 'pobyty-all-inclusive', true],
  [/\brum\b|\brumu\b|whisky|whiskey|destilat/, 'degustace-rumu-a-whisky', false],
];
// series that only make sense for stays (a castle tour or a romantic dinner is not a castle stay)
const STAY_ONLY = new Set(['romanticke-pobyty', 'pobyty-na-zamku', 'pokoje-s-virivkou', 'pobyty-na-sumave', 'pobyty-v-krkonosich', 'pobyty-v-jesenikach', 'pobyty-v-beskydech', 'pobyty-v-mikulove', 'pobyty-all-inclusive']);
export const seriesCats = (name: string): string[] => {
  const n = norm(name), stay = isStay(n);
  return SERIES.filter(([re, s, stayOk]) => re.test(n) && (stayOk || !stay) && (stay || !STAY_ONLY.has(s))).map(([, s]) => '@' + s);
};

/** True when the offer is an overnight stay (variants "2 noci", "pobyt", accommodation words). */
export const isStay = (t: string) => /(pobyt|ubytovani|hotel\b|hotelu|penzion|apartm|glamping|tiny ?house|treehouse|jurt[aouy]|maringotk|kupol[ea]? s|\d+ noc|noci\b|nocleh)/.test(norm(t));

/** The name decides (first 140 characters of the text); the description only when the name matches nothing — otherwise
 *  a "Wellness pobyt" mentioning a massage would land among massages. */
export function classify(text: string, stay?: boolean, name?: string): string[] {
  const head = norm((name ?? text).slice(0, 140));
  const full = norm(text);
  const st = stay ?? isStay(head);
  const rules = st ? STAY : EXP;
  const pick = (t: string) => {
    const out: string[] = [];
    for (const [re, slug] of rules) if (re.test(t) && !out.includes(slug)) { out.push(slug); if (out.length >= 2) break; }
    return out;
  };
  const out = pick(head).length ? pick(head) : pick(full);
  return out.length ? out.map((s) => '@' + s) : [st ? '@pobyty' : '@zazitky'];
}
