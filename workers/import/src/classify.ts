// Keyword classifier for feeds that carry no usable category tree (Adrop: a flat type) and for Zlavomat deals whose
// subcategory the old tree does not know. Patterns match Czech AND Slovak stems (ASCII, the Adrop SK params are Czech). Returns slugs of the category tree ("@slug", see engine.resolveCats): the most
// specific match first, at most two, the section as the fallback.
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STAY: Array<[RegExp, string]> = [
  [/glamping|jurt[aouy]|kupol|maringotk|tiny ?house|treehouse|posed|bublin|stan(ovy|u)\b/, 'glamping'],
  [/hausbot|vodni domek|domek na vode|vodn\w* domcek|netradicn/, 'netradicne-ubytovanie'],
  [/lazn|kupel|kupeln|termal|spa pobyt|rehabilit/, 'kupelne-pobyty'],
  [/wellness|sauna|virivk|privatn\w* zon|masaz/, 'wellness-pobyty'],
  [/romantick|pro dva|pre dvoch|pro pary|pre pary|pro paru|pre paru|svatebni noc|svadobn\w* noc/, 'pobyty-pre-dvoch'],
  [/gurman|vinar|degustac|vinn[ye]|pivn[ye]/, 'degustacne-pobyty'],
  [/hory|horach|lyz|snezk|tatr|liptov|orav|fatr|pienin|chopok|jasna|donoval|zakopan|sumav|krkonos|jeseni[kc]|beskyd/, 'dovolenka-na-horach'],
  [/rodin|s detmi|pro deti|pre deti/, 'pobyty-s-detmi'],
  [/se psem|so psom|pes\b|psik|mazlicek|domac\w* milac/, 'pobyty-so-psom'],
  [/silvestr/, 'silvestrovske-pobyty'], [/vanoc|vianoc|advent/, 'vianocne-pobyty'], [/velikonoc|velkonoc/, 'velkonocne-pobyty'], [/valentyn|valentin/, 'valentinske-pobyty'],
  [/vikend/, 'vikendove-pobyty'],
  [/cyklo|kolo|bicyk|golf|aktivn|rybar|jezdeck|jazdeck/, 'aktivna-dovolenka-a-sport'],
  [/chat[ayu]|chalup/, 'chaty-a-chalupy'], [/penzion/, 'penziony'], [/zamek|zamok|zamku|kastiel|luxus|chateau/, 'luxusne-ubytovanie'],
];

const EXP: Array<[RegExp, string]> = [
  [/\bkino\b|kina\b|divadl|predstaven|koncert|cirkus|mjuzikl|opera\b|vstupenk\w* na/, 'kultura-a-vylety'],
  [/\bbalon/, 'lety-balonom'],
  [/vyhlidkov\w* let|vyhliadkov\w* let|vrtulnik|paraglid|tandem|seskok|zoskok|vetron|letoun|letadl|lietadl|\blet\b|\blety\b|dron|vzdusn/, 'vyhliadkove-lety'],
  [/simulator|virtualn\w* realit|\bvr\b/, 'virtualna-realita'],
  [/unikov\w* hr|escape/, 'escape-room'],
  [/paintball|laser ?game|laser tag|lasergame/, 'paintball-a-lasergame'],
  [/airsoft|strelb|strelni|zbran|kulomet|kurz strel/, 'strelba-na-strelnici'],
  [/motokar|\bkart/, 'motokary'],
  [/okruh|formul|supercar|ferrari|lamborghini|porsche|spolujizd|spolujazd|driftov|offroad|ctyrkol|buggy|\btank|monster|jizd\w* v |jazd\w* v |zazitkov\w* jizd|zazitkov\w* jazd|rizeni (auta|vozu|kamion|bagr|tank)|riadeni\w* (auta|vozidl|kamion|bagr|tank)/, 'zazitkove-jazdy'],
  [/bungee|zip ?line|lanov|lezeck|horolez|via ferrat|skok z|stezka v korunach/, 'lanove-centra'],
  [/raft|kanoe|kanu\b|paddle|\blod[ei]|\blod\b|lodou|plavb|jacht|kajak|vodni|vodn\w* (sport|zazit|bicyk|lyz)|splav|potap|diving|surf|vodak|jetski|vodni skútr/, 'vodne-zazitky'],
  [/teambuilding|skupinov|firemni/, 'teambuilding'],
  [/bowling|biliard|dartu|\bsipk|zabavn\w* centrum|detsk\w* zabavn|trampolin/, 'bowling'],
  [/masaz/, 'masaze'],
  [/solna jeskyn|soln\w* jaskyn|solna/, 'solna-jaskyna'],
  [/sauna|wellness|virivk|infrasauna|lazne|kupel|termal|bazen|floating|flotac/, 'sauna-a-wellness'],
  [/kosmet|kozmet|osetreni pleti|osetren\w* plet|lifting|liceni|licen\w* |oboci|mihalnic|\brasy\b|epilac|depilac|botox|laser\w* (odstran|vlas)/, 'kozmeticke-sluzby'],
  [/manikur|pedikur|nehty|necht|gelov/, 'manikura-a-pedikura'],
  [/kadernic|barber|strih|holeni|holen\w* /, 'kadernictvo'],
  [/hubnut|chudnut|tvarovan|kryolip|cellulit|pressoterap/, 'zostihlujuce-procedury'],
  [/kurz\w* (vareni|peceni)|vareni|varen\w* |peceni|pecen\w* |cukrar|barista/, 'kurzy-varenia'],
  [/kurz\w* (malovan|kresl)|malovan|kresleni|kreslen|malirsk|maliar/, 'kurzy-malovania'],
  [/kurz\w* foceni|kurz\w* foten|fotografovan|workshop foto/, 'kurzy-fotenia'],
  [/keramik|hrncir|hrnciar|tvoreni|tvoren|vyrob|rezbar|sklo|kovar|svicek|sviec|mydl|workshop/, 'kreativne-kurzy'],
  [/tanecn|tanec|salsa|zumba/, 'sportove-kurzy'],
  [/jazykov|anglick|nemeck|kurz\w* jazyk/, 'jazykove-kurzy'],
  [/degustac|vinarstv|pivovar|whisk|\bgin\b|\brum\b|ochutnavk|sommelier|barmansk/, 'degustacia-vina-a-piva'],
  [/\bkone\b|konsk|jezdec|jazdec|hippo|jizd\w* na koni|jazd\w* na koni/, 'jazdenie-na-koni'],
  [/zoo\b|safari|zviratk|zvieratk|krmeni|krmen|alpak|lam[ay]|sokoln|sokoliar/, 'za-zvieratkami'],
  [/aquapark|akvapark|zabavn\w* park|dino ?park|lanovk/, 'zabavne-parky'],
  [/muzeum|muzea|vystav|galeri|hrad\b|zamek|zamok|kastiel|prohlidk|prehliadk|pamatk|jeskyn|jaskyn/, 'vystavy-a-muzea'],
  [/venkovni hr|vonkajs\w* hr|city ?quest|pohadkov|rozpravkov|lov pokladu|geocach|stezka|chodnik/, 'vonkajsie-hry'],
  [/pujcovn|pozicovn|pronajem|prenajom|vypujc|vypozic|elektrokol|kolobez/, 'pozicovne'],
  [/snowkit|lyzar|snowboard|bruslen|korculovan|zimni sport|zimn\w* sport|lyzovan/, 'zimne-sporty'],
  [/cviceni|cvicen|posilovn|posilnovn|fitness|yoga|joga|pilates|crossfit|trenink|trening|\bbox\b/, 'fitness'],
  [/foceni|foten|fotoateli|fotograf/, 'fotenie'],
  [/dets|detsk|pro deti|pre deti|deti\b/, 'zazitky-pre-deti'],
  [/adrenalin|extremn/, 'adrenalinove-zazitky'],
  [/striptyz|striptiz|erotick/, 'striptiz'],
];

/** Series with their own hub category, added to whatever the source's own tree says.
 *  Third field: also applies to stay offers (a hotel that merely mentions a minigolf or an ATV must not land in that series). */
const SERIES: Array<[RegExp, string, boolean]> = [
  [/cirkus|cirkusu/, 'cirkus', true],
  [/head ?spa/, 'head-spa', true],
  // spa towns (content gap 3. 11. 2026: "kupele X pobyt" 100–860 searches each) — stays only, matched in name or address
  [/bardejov/, 'bardejovske-kupele', true], [/bojnic/, 'kupele-bojnice', true], [/rajeck\w* teplic/, 'kupele-rajecke-teplice', true],
  [/turcianske teplic|turcianskych teplic/, 'kupele-turcianske-teplice', true], [/trencianske teplic|trencianskych teplic/, 'kupele-trencianske-teplice', true],
  [/ajurved|ayurved/, 'ajurveda', true],
  [/(husac|kacac|husi|kaci)\w* (hod|menu|stehn|veceri)|martinsk\w* (hod|hus)|pecen\w* (kacic|husac)|husacin/, 'husacie-hody', false],
  [/wellness\w*.*(s detmi|pre rodin|rodinn)|rodinn\w* wellness/, 'wellness-pobyty-s-detmi', true],
  // "wellness s večerou (pre dvoch)" = the best GSC query of the old WordPress site (category kept, audit 2. 11. 2026)
  [/wellness\w* (s|a|so) (vecer|veceru|vecere|vecera)|privatn\w* wellness\w* (s|a) vecer/, 'wellness-s-vecerou', true],
  [/ferrari/, 'jazda-vo-ferrari', false],
  [/lamborghini/, 'jazda-v-lamborghini', false],
  [/porsche|porshe/, 'jazda-v-porsche', false],
  [/mustang/, 'jazda-vo-forde-mustang', false],
  [/dodge|challenger|hellcat/, 'jazda-v-dodge', false],
  [/\btatr(a|ou|u) ?\d{3}|\btatrou\b/, 'jazda-tatrou', false],
  [/bugin|buggy|ctyrkol|stvorkolk|\batv\b|offroad|off-road|4x4/, 'buginy-a-stvorkolky', false],
  [/seskok|zoskok|skydiv|volneho padu/, 'tandemovy-zoskok', false],
  [/paraglid/, 'paragliding', false],
  [/vzducholod/, 'let-vzducholodou', false],
  [/vetrn\w* tunel|vetern\w* tunel|windtunnel/, 'veterny-tunel-a-volny-pad', false],
  [/ferrat/, 'via-ferrata', false],
  [/jetpack|hoverboard|flyboard/, 'flyboarding-a-jetpack', false],
  [/potap|freediving|diving/, 'potapanie', false],
  [/lukostrel/, 'lukostrelba', false],
  [/minigolf/, 'minigolf', false],
  [/hospodsky kviz|pub ?quiz|\bkviz\b/, 'pub-kviz', false],
  [/pivn\w* (lazn|koupel|kupel|spa|wellness)/, 'pivne-kupele', true],
  [/privatn\w* (wellness|spa|sauna|virivk)|soukrom\w* (wellness|spa|sauna|virivk)|sukromn\w* (wellness|spa|sauna|virivk)/, 'privatny-wellness', true],
  [/tanecn|taneni|\btanec\b|\btance\b|salsa|bachata|zumba/, 'tanecne-kurzy', false],
  [/\bkoz[aeouy]\b|kozami|kozou|alpak|oslik/, 'prechadzka-s-alpakami', false],
  [/premier league|carabao|fa cup/, 'zajazdy-na-premier-league', false],
  [/serie a|coppa italia/, 'zajazdy-na-serie-a', false],
  [/la liga/, 'zajazdy-na-la-ligu', false],
  [/bundesliga/, 'zajazdy-na-bundesligu', false],
  [/ligue 1/, 'zajazdy-na-ligue-1', false],
  [/liga mistru|ligu mistru|liga majstrov|ligu majstrov|champions league/, 'zajazdy-na-ligu-majstrov', false],
  [/evropsk\w+ lig|europsk\w+ lig|europa league/, 'zajazdy-na-europsku-ligu', false],
  [/\bnhl\b/, 'zajazdy-na-nhl', false],
  [/mistrovstvi sveta v hokeji|majstrovstva sveta v hokeji|ms v hokeji/, 'zajazdy-na-ms-v-hokeji', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bliverpool\b)/, 'listky-liverpool', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:manchester united)/, 'listky-manchester-united', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:manchester city)/, 'listky-manchester-city', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\barsenal\b)/, 'listky-arsenal', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bchelsea\b)/, 'listky-chelsea', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\btottenham\b)/, 'listky-tottenham', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:fc barcelona)/, 'listky-fc-barcelona', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:real madrid)/, 'listky-real-madrid', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:atletico madrid)/, 'listky-atletico-madrid', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:b\. ?mnichov|bayern)/, 'listky-bayern-mnichov', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:dortmund)/, 'listky-borussia-dortmund', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bjuventus\b)/, 'listky-juventus', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:inter milan)/, 'listky-inter-milano', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:ac milan)/, 'listky-ac-milano', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:neapol|napoli)/, 'listky-ssc-neapol', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:as rim)/, 'listky-as-rim', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:lazio)/, 'listky-lazio-rim', false],
  [/^(?=.*(zapas|ligu mistru|ligu majstrov|evropsk\w+ lig|europsk\w+ lig|konferencn\w+ lig|premier league|serie a|la liga|bundesliga|ligue 1)).*(?:\bpariz\b|\bpsg\b|paris saint)/, 'listky-paris-saint-germain', false],
  [/bungee|bunge\w* jump|skok z (jerabu|mostu)/, 'bungee-jumping', false],
  [/skol\w* smyku|\bsmyk\b|driftov\w* (kurz|skol)|bezpecn\w* jizd|bezpecn\w* jazd/, 'skola-smyku', false],
  [/\bl-?39\b|albatros|stihack/, 'let-stihackou', false],
  [/romantick\w* (pobyt|vikend|noc|ubytovani|wellness|dovolena|escape)/, 'romanticke-pobyty', true],
  [/zamek|zamok|zamku|zamecke|zamecky|zamock|kastiel|chateau/, 'pobyt-na-zamku', true],
  [/rybar|rybol|rybolov|rybni/, 'rybolov', false],
  [/romantick\w* vecer|vecer\w* (pro dva|pre dvoch|pri svick|pri sviec)/, 'romanticka-vecera', false],
  [/rozluck/, 'rozlucka-so-slobodou', true],
  [/(pokoj|izb|apartma|apartman|chata|chatka|domek|domcek)\w* s (soukromou |sukromnou |privatni |privatnou )?virivk|virivk\w* (na|v) (pokoj|izb)/, 'izby-s-virivkou', true],
  [/v oblacich|v oblakoch|dinner in the sky/, 'vecera-v-oblakoch', false],
  [/preziti|prezit|survival|bushcraft/, 'kurzy-prezitia', false],
  [/barist|latte art|kurz o kave/, 'baristicke-kurzy', false],
  [/vrtulnik/, 'let-vrtulnikom', false],
  [/letecky simulator|simulator (letadl|letu|boeing)|boeing|airbus|cessna/, 'letecke-simulatory', false],
  [/vysok\w* tatr|smokovec|strbsk|tatransk|zdiar|stary smokovec|lomnic/, 'pobyty-vo-vysokych-tatrach', true],
  [/nizk\w* tatr|jasna|demanovsk|chopok|donoval|tale\b|mytn/, 'pobyty-v-nizkych-tatrach', true],
  [/liptov|besenov|tatralandi|bialka/, 'pobyty-na-liptove', true],
  [/\borav|zuberec|habovk|namestov|oravic/, 'pobyty-na-orave', true],
  [/mal\w* fatr|terchov|vratn|rajeck/, 'pobyty-v-malej-fatre', true],
  [/slovensk\w* raj|hrabusic|podlesok|dedinky/, 'pobyty-v-slovenskom-raji', true],
  [/stiavnic/, 'pobyty-v-banskej-stiavnici', true],
  [/piestan/, 'kupele-piestany', true],
  [/all inclusive|ultra all|\bal\b inclusive/, 'dovolenka-all-inclusive', true],
  [/\brum\b|\brumu\b|whisky|whiskey|destilat/, 'degustacia-rumu-a-whisky', false],
];
// series that only make sense for stays (a castle tour or a romantic dinner is not a castle stay)
const STAY_ONLY = new Set(['bardejovske-kupele', 'kupele-bojnice', 'kupele-rajecke-teplice', 'kupele-turcianske-teplice', 'kupele-trencianske-teplice', 'wellness-pobyty-s-detmi', 'romanticke-pobyty', 'pobyt-na-zamku', 'izby-s-virivkou', 'pobyty-vo-vysokych-tatrach', 'pobyty-v-nizkych-tatrach', 'pobyty-na-liptove', 'pobyty-na-orave', 'pobyty-v-malej-fatre', 'pobyty-v-slovenskom-raji', 'pobyty-v-banskej-stiavnici', 'kupele-piestany', 'dovolenka-all-inclusive']);
export const seriesCats = (name: string): string[] => {
  const n = norm(name), stay = isStay(n);
  return SERIES.filter(([re, s, stayOk]) => re.test(n) && (stayOk || !stay) && (stay || !STAY_ONLY.has(s))).map(([, s]) => '@' + s);
};

/** True when the offer is an overnight stay (variants "2 noci", "pobyt", accommodation words). */
export const isStay = (t: string) => /(pobyt|ubytovani|ubytovan|hotel\b|hotelu|penzion|apartm|glamping|tiny ?house|treehouse|jurt[aouy]|maringotk|kupol[ea]? s|\d+ noc|noci\b|nocleh|noclah)/.test(norm(t));

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
