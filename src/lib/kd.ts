// Texts and rules of the WordPress child theme (category FAQ and intros by section, city × category intros, the 404 →
// category heuristic), ported from the Czech sister site and written in Slovak for kuzelnemiesta.sk (2. 11. 2026).
import { overenych } from './format';
import { SITE_NAME } from './site';

export type Kind = 'pobyt' | 'zazitek' | 'restaurace' | 'krasa' | 'kurz' | 'obecne';
// sections of the redesign v2 tree (src/data/taxonomie.json)
const ROOT_KIND: Record<string, Kind> = { pobyty: 'pobyt', zazitky: 'zazitek', 'jedlo-a-pitie': 'restaurace', 'wellness-a-krasa': 'krasa', kurzy: 'kurz' };
/** kd_category_kind(): by the slug of the root category. */
export const kindOf = (rootSlug: string): Kind => ROOT_KIND[rootSlug] ?? 'obecne';

const SAFE = `${SITE_NAME} je rozcestník ponúk. Po kliknutí prejdete priamo k overenému partnerovi, kde objednávku dokončíte v jeho zabezpečenom prostredí. Cena pre vás zostáva rovnaká.`;
/** The general "how buying works" question of every FAQ (views.ts appends it to a category's own questions). */
export const BUY_Q = /nákup|rezerváci/i;

export function categoryFaq(name: string, kind: Kind): Array<{ q: string; a: string }> {
  const n = name.toLowerCase();
  switch (kind) {
    case 'pobyt': return [
      { q: `Ako vybrať ten správny pobyt v kategórii ${n}?`, a: 'Zoraďte ponuky podľa ceny, obľúbenosti alebo od najnovších a využite cenový filter. Pri každom pobyte vidíte lokalitu, čo je v cene, pôvodnú aj zvýhodnenú cenu a úsporu v eurách. Termíny a kapacity sa rýchlo menia, preto sa oplatí rezervovať s predstihom.' },
      { q: 'Čo býva zahrnuté v cene pobytu?', a: 'Podľa konkrétnej ponuky najčastejšie ubytovanie s raňajkami či polpenziou, vstup do wellness, parkovanie alebo dieťa zdarma. Presný rozsah vždy nájdete v detaile ponuky u partnera.' },
      { q: 'Ako prebieha rezervácia a je bezpečná?', a: SAFE },
      { q: 'Dá sa pobyt darovať alebo má otvorený termín?', a: 'Mnohé pobyty si môžete kúpiť ako darčekový voucher s dlhšou platnosťou, pri ktorom si termín vyberiete neskôr. Preto sa skvele hodia ako darček. Podmienky platnosti uvádza každá ponuka.' },
    ];
    case 'zazitek': return [
      { q: `Ako vybrať ten pravý zážitok v kategórii ${n}?`, a: 'Filtrujte podľa ceny a lokality a porovnajte varianty. Pri každom zážitku vidíte, čo obnáša, pôvodnú aj zvýhodnenú cenu a úsporu v eurách. Myslite aj na to, pre koho je zážitok určený – inú náladu má adrenalín a inú wellness.' },
      { q: 'Koľko zážitky stoja a ako sa počíta cena?', a: 'Ceny sa líšia podľa typu zážitku. Zbierame zvýhodnené ponuky a darčekové vouchery od preverených partnerov, takže pri väčšine zážitkov vidíte pôvodnú cenu aj vypočítanú úsporu.' },
      { q: 'Ako prebieha nákup a je bezpečný?', a: SAFE },
      { q: 'Dá sa zážitok darovať?', a: 'Väčšina zážitkov sa kupuje ako darčekový voucher, často s otvorenou platnosťou. Obdarovaný si potom sám zvolí termín – ideálny darček na poslednú chvíľu aj s predstihom.' },
    ];
    case 'restaurace': return [
      { q: `Ako vybrať podnik v kategórii ${n}?`, a: 'Porovnajte lokalitu, typ kuchyne a to, čo ponuka zahŕňa. Pri každej ponuke vidíte pôvodnú aj zvýhodnenú cenu a úsporu v eurách, takže ľahko vyberiete podľa chuti aj rozpočtu.' },
      { q: 'Ako fungujú vouchery do reštaurácií?', a: 'Väčšinou ide o zvýhodnené menu alebo degustáciu za pevnú cenu. Rozsah (počet chodov, nápoje, počet osôb) aj platnosť nájdete v detaile konkrétnej ponuky u partnera.' },
      { q: 'Ako prebieha nákup a je bezpečný?', a: SAFE },
      { q: 'Musím si termín rezervovať vopred?', a: 'Pri gastro ponukách sa rezervácia termínu odporúča – konkrétny postup a platnosť voucheru uvádza každá ponuka. Často poslúži aj ako darček.' },
    ];
    case 'krasa': return [
      { q: `Ako vybrať procedúru v kategórii ${n}?`, a: 'Filtrujte podľa ceny a lokality a porovnajte salóny aj rozsah procedúry. Pri každej ponuke vidíte pôvodnú aj zvýhodnenú cenu a úsporu v eurách, takže ľahko vyberiete tú pravú.' },
      { q: 'Čo býva v cene a ako dlho procedúra trvá?', a: 'Dĺžka aj rozsah sa líšia podľa ponuky – od krátkeho ošetrenia po niekoľkohodinové balíčky. Presný obsah a dĺžku nájdete v detaile ponuky u partnera.' },
      { q: 'Ako prebieha nákup a je bezpečný?', a: SAFE },
      { q: 'Dá sa procedúra darovať?', a: 'Áno, väčšinu procedúr si môžete kúpiť ako darčekový voucher s dlhšou platnosťou. Skvele sa hodí ako darček – obdarovaný si termín vyberie sám.' },
    ];
    case 'kurz': return [
      { q: `Ako vybrať kurz v kategórii ${n}?`, a: 'Porovnajte dĺžku kurzu, počet účastníkov, miesto konania a to, čo je v cene (materiál, ochutnávka, certifikát). Pri každej ponuke vidíte pôvodnú aj zvýhodnenú cenu a úsporu v eurách.' },
      { q: 'Je kurz vhodný pre začiatočníkov?', a: 'Väčšina kurzov je určená začiatočníkom aj mierne pokročilým — lektor vás všetkým prevedie. Úroveň a požiadavky nájdete v detaile ponuky u partnera.' },
      { q: 'Ako prebieha nákup a je bezpečný?', a: SAFE },
      { q: 'Dá sa kurz darovať?', a: 'Áno, kurzy sú obľúbeným zážitkovým darčekom. Kúpite ich ako voucher s dlhšou platnosťou a obdarovaný si termín vyberie sám.' },
    ];
    default: return [
      { q: `Ako vybrať tú správnu ponuku v kategórii ${n}?`, a: 'Zoraďte ponuky podľa ceny, obľúbenosti alebo od najnovších a využite cenový filter. Pri každej ponuke vidíte pôvodnú aj zvýhodnenú cenu a úsporu v eurách. Ponuky denne dopĺňame.' },
      { q: 'Koľko ponuky stoja a ako sa počíta cena?', a: 'Ceny sa líšia podľa typu ponuky a termínu. Zbierame zvýhodnené ponuky a darčekové vouchery od preverených partnerov, takže pri väčšine vidíte pôvodnú cenu aj vypočítanú úsporu.' },
      { q: 'Ako prebieha nákup a je bezpečný?', a: SAFE },
      { q: 'Dajú sa ponuky darovať?', a: 'Väčšinu ponúk si môžete kúpiť ako darčekový voucher, často s dlhšou platnosťou. Sú preto ideálnym darčekom.' },
    ];
  }
}

export function categoryIntro(name: string, kind: Kind): string {
  switch (kind) {
    case 'pobyt': return `Vyberáte v kategórii ${name}? Porovnajte lokalitu, čo je v cene, aj hodnotenia a sledujte úsporu v eurách. Najvýhodnejšie pobyty rýchlo miznú, preto sa oplatí rezervovať včas. Po kliknutí prejdete k overenému partnerovi, cena sa nemení.`;
    case 'zazitek': return `Hľadáte v kategórii ${name} ten pravý zážitok? Vyberajte podľa ceny, lokality aj toho, pre koho je zážitok určený. Pri každej ponuke vidíte pôvodnú cenu aj úsporu a väčšinu zážitkov kúpite ako darčekový voucher s otvorenou platnosťou. Po kliknutí prejdete k overenému partnerovi, cena zostáva rovnaká.`;
    case 'restaurace': return `Vyberáte v kategórii ${name}? Porovnajte typ kuchyne, lokalitu a to, čo voucher zahŕňa. Pri každej ponuke vidíte zvýhodnenú cenu aj úsporu. Po kliknutí prejdete k overenému partnerovi, kde objednávku dokončíte – cena sa nemení.`;
    case 'kurz': return `Chcete sa naučiť niečo nové alebo darovať kurz? V kategórii ${name} porovnáte lektorov, dĺžku aj to, čo je v cene, a hneď vidíte úsporu. Väčšinu kurzov kúpite ako darčekový voucher s otvoreným termínom. Po kliknutí prejdete k overenému partnerovi, cena sa nemení.`;
    case 'krasa': return `Hľadáte v kategórii ${name} tú pravú starostlivosť? Porovnajte salóny, rozsah procedúry aj hodnotenia a sledujte úsporu v eurách. Skvelý tip aj na darček. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
    default: return `Vyberáte v kategórii ${name}? Porovnajte ceny aj hodnotenia a sledujte úsporu v eurách. Ponuky denne dopĺňame. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
  }
}

/** kd_combo_intro_html(): the longer category × city text (unique content of the combo landing). */
export function comboIntro(cat: string, lok: string, count: number, kind: Kind): string {
  const catl = cat.toLowerCase();
  const ov = overenych(count);
  switch (kind) {
    case 'pobyt': return `Plánujete ${catl} ${lok} a okolí? Na jednom mieste máme ${ov}, aby ste nemuseli porovnávať desiatky webov. Pri každom pobyte vidíte lokalitu, čo je v cene (raňajky či polpenzia, vstup do wellness, parkovanie alebo dieťa zdarma), pôvodnú aj zvýhodnenú cenu a úsporu v eurách. Najvýhodnejšie pobyty ${lok} rýchlo miznú, oplatí sa rezervovať s predstihom — a mnohé z nich kúpite ako darčekový voucher s otvoreným termínom. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
    case 'zazitek': return `Hľadáte ${catl} ${lok}? Prehľadne na jednom mieste máme ${ov}. Vyberajte podľa ceny, lokality aj toho, pre koho má byť zážitok určený — inú náladu má adrenalín a inú romantika či wellness. Pri každej ponuke vidíte úsporu v eurách a väčšinu zážitkov ${lok} kúpite ako darčekový voucher s otvorenou platnosťou, takže skvele poslúžia aj ako darček. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
    case 'restaurace': return `Máte chuť na ${catl} ${lok}? Na jednom mieste máme ${ov}. Porovnáte typ kuchyne, lokalitu aj to, čo voucher zahŕňa (počet chodov, nápoje, počet osôb), a hneď vidíte zvýhodnenú cenu a úsporu v eurách. Pri gastro ponukách sa oplatí rezervovať termín vopred; mnohé fungujú aj ako darček. Po kliknutí prejdete k overenému partnerovi, kde objednávku dokončíte — cena pre vás zostáva rovnaká.`;
    case 'krasa': return `Hľadáte ${catl} ${lok}? Prehľadne na jednom mieste máme ${ov}. Porovnajte salóny, rozsah a dĺžku procedúry aj hodnotenia a sledujte úsporu v eurách. Väčšinu procedúr ${lok} kúpite aj ako darčekový voucher s dlhšou platnosťou — ideálny darček, pri ktorom si termín vyberie obdarovaný. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
    default: return `Hľadáte ${catl} ${lok}? Na jednom mieste máme ${ov}. Porovnajte ceny aj hodnotenia a sledujte úsporu v eurách; ponuky navyše denne dopĺňame. Mnohé z nich kúpite ako darčekový voucher s dlhšou platnosťou. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
  }
}

export function cityIntro(lok: string): string {
  return `Hľadáte zážitky, pobyty alebo dovolenku ${lok}? Overené ponuky sme pre vás zozbierali na jednom mieste — od wellness a romantiky po gastro a adrenalín. Porovnajte ceny aj hodnotenia a vyberte si tú pravú. Po kliknutí prejdete k overenému partnerovi, cena pre vás zostáva rovnaká.`;
}

/** kd_service_cat_candidates(): category chips on a city page (shown when the combo has ≥ 40 offers). */
export const SERVICE_CATS: Array<[string, string]> = [
  ['masaze', 'Masáže'], ['zazitky', 'Zážitky'], ['jedlo-a-pitie', 'Reštaurácie a bary'], ['wellness-a-krasa', 'Krása a relax'],
  ['kozmeticke-sluzby', 'Kozmetika'], ['sauna-a-wellness', 'Sauna a wellness'], ['adrenalinove-zazitky', 'Adrenalín'], ['degustacne-menu', 'Degustácie'],
  ['kaviarne-a-torty', 'Kaviarne'], ['kozmeticke-sluzby', 'Starostlivosť o pleť'],
];

/** An unknown path (old WooCommerce category / location tag / offer slug that no longer exists) → the closest live category.
 *  Order matters, first match wins; the text is the lower-case ASCII path with "-" between words. Nothing here ends in a 404:
 *  the fallback is the section of the stay / experience. */
const D = (s: string) => `/${s}/`;
const GEO: Array<[RegExp, string]> = [
  // Czech regions and mountains first (names overlap with the foreign towns below)
  [/\b(jizni-morava|brno|znojmo|lednice|breclav|hnanice|velke-pavlovice|mikulov|hodonin)\b/, 'dovolenka-v-cesku'],
  [/\b(jizni-cechy|cesky-krumlov|tabor|pisek|hartmanice|lipno)\b/, 'dovolenka-v-cesku'],
  [/\b(severni-morava|ostrava|novy-jicin|slavicin|rapotin|frydlant|jesenik|jeseniky|karvina)\b/, 'dovolenka-v-cesku'],
  [/\b(stredni-cechy|benesov|kurim|caslav|kadan|decin|lysice|oponice|senohraby|adrspach|kvasetice)\b/, 'dovolenka-v-cesku'],
  [/\b(zapadni-cechy|plzen|sumava|bavorsky-les|krusne-hory|nove-hamry)\b/, 'dovolenka-v-cesku'],
  [/\b(vysocina|jihlava|zdar|velichovky)\b/, 'dovolenka-v-cesku'],
  [/\b(praha|prague)\b/, 'dovolenka-v-cesku'],
  [/\b(liberec|jizerske-hory|harrachov|benecko|jablonec|doksy|cesky-raj|horni-libchavy|zlate-hory|jicin|krkonose)\b/, 'dovolenka-v-cesku'],
  [/\b(karlovy-vary|marianske-lazne|luhacovice)\b/, 'dovolenka-v-cesku'],
  [/\b(orlicke-hory|pardubice|letohrad|chrastovice)\b/, 'dovolenka-v-cesku'],
  [/\b(hradec-kralove|bile-karpaty|frydlant)\b/, 'dovolenka-v-cesku'],
  [/\b(zlin|zlin-a-okoli|beskydy|pozlovice)\b/, 'dovolenka-v-cesku'],
  [/\b(olomouc|jeseniky|jesenik)\b/, 'dovolenka-v-cesku'],
  [/\b(chomutov|usti|teplice|jirkov|most)\b/, 'dovolenka-v-cesku'],
  [/\b(cesko|ceska-republika|cela-cr|domaci|dovolena-2025|dovolena-2026|leto-2025|jizni-cechy)\b/, 'dovolenka-v-cesku'],
  // abroad: a country category when we have one, else the sea / abroad category
  [/\b(madarsko|budapest|balaton\w*|heviz\w*|sarvar|bukfurdo|harkany|mezokovesd|miskolctapolca|zalakaros|cserkeszolo|demjen|gyor|tiszaujvaros|szentgotthard|komarom|sopron|bogacs|ostrihom|eger|hajduszoboszlo|balmazujvaros|zalacsany|felcsut|gotthard)\b/, 'dovolenka-v-madarsku'],
  [/\b(polsko|polske|kudowa\w*|kliczkow|krakov|gdansk|mezizdroje|vratislav|jeleni-hora|lehnice|bila|tatry|zakopane|baltske-more)\b/, 'dovolenka-v-polsku'],
  [/\b(slovensko|zuberec|vrbov|liptov|orava|velka-fatra|besenova|bojnice|slovensky-raj|bratislava|nizke-tatry|vysoke-tatry|nesvady|velky-meder|nizke-taury|vysoke-taury|brezova|krakow)\b/, 'dovolenka-na-slovensku'],
  [/\b(italie|grado|riccione|ischia|falcade|civetta\w*|val-di-fiemme|veneto|orbetello|rim|calella|lovran)\b/, 'dovolenka-v-taliansku'],
  [/\b(chorvatsko|novigrad|vodice|istrie|dalmacie)\b/, 'dovolenka-v-chorvatsku'],
  [/\b(rakousko|semmering|goldegg|grossarl|pertisau|korutany|salcbursko|muhlbach|linec|tyrolsko|alpy)\b/, 'dovolenka-v-rakusku'],
  [/\b(slovinsko|lendava|kamnik|kolobreh)\b/, 'dovolenka-v-slovinsku'],
  [/\b(nemecko|bad-griesbach|bad-muskau|langenfeld|papenburg|wedel|hamburk|mnichov|rujana|klink|dortmund|nahe)\b/, 'dovolenka-v-nemecku'],
  [/\b(bulharsko|varna|carevo|primorsko|recko|kreta|kos|zakynthos|kefalonia|acharavi|paralia|hvd|hotel-[a-z]+|egypt|marsa-alam|tunisko\w*|djerba|turecko|spanelsko|katalansko|portugalsko|cerna-hora|albanie|francie|belgie|dansko|nizozemi|norsko|svycarsko|island|agia-napa|kypr|armenie|gruzie|indie|jordansko|oman|maroko|thajsko|vietnam|filipiny|indonesie|japonsko|kuba|mexiko|brazilie|peru|kostarika|tanzanie|uzbekistan|sri-lanka|spojene-staty|rumunsko|la-palma|male|sol-guadalupe|condesa|villa-ilex|koupani-v-mori|plavky-u-more)\b/, 'dovolenka-pri-mori'],
];
const THEME: Array<[RegExp, string]> = [
  [/v-oblacich|dinner-in-the-sky/, 'vecera-v-oblakoch'], [/preziti|survival/, 'kurzy-prezitia'], [/barist|latte-art/, 'baristicke-kurzy'], [/vrtulnik/, 'let-vrtulnikom'], [/letecky-simulator|boeing|airbus/, 'letecke-simulatory'],
  [/bungee|bunge-jump/, 'bungee-jumping'], [/skola-smyku|smyk/, 'skola-smyku'], [/l-39|albatros|stihack/, 'let-stihackou'], [/rybar|rybol/, 'rybolov'], [/rozluck/, 'rozlucka-so-slobodou'], [/romanticka-vecere|vecere-pro-dva/, 'romanticka-vecera'],
  [/ferrari/, 'jazda-vo-ferrari'], [/lamborghini|lambo/, 'jazda-v-lamborghini'], [/porsche/, 'jazda-v-porsche'], [/mustang/, 'jazda-vo-forde-mustang'], [/dodge|challenger/, 'jazda-v-dodge'], [/tatra|tatrou/, 'jazda-tatrou'],
  [/seskok|skydiv/, 'tandemovy-zoskok'], [/paraglid/, 'paragliding'], [/vzducholod/, 'let-vzducholodou'], [/vetrny-tunel|volny-pad/, 'veterny-tunel-a-volny-pad'], [/ferrat/, 'via-ferrata'], [/jetpack|hoverboard|flyboard/, 'flyboarding-a-jetpack'],
  [/potap|freediving/, 'potapanie'], [/lukostrel/, 'lukostrelba'], [/minigolf/, 'minigolf'], [/kviz|quiz/, 'pub-kviz'], [/privatni-wellness|privatni-spa/, 'privatny-wellness'], [/tanecn|tanec-|salsa|bachata/, 'tanecne-kurzy'], [/koz[aeouy]?-|kozou|alpak/, 'prechadzka-s-alpakami'],
  [/pivni-lazne|pivni-koupel/, 'pivne-kupele'], [/bugin|buggy|ctyrkol|offroad|atv/, 'buginy-a-stvorkolky'],
  // services (old WooCommerce categories and long offer slugs)
  [/let-stihack|stihack|vetron|paraglid|balon|vyhlidkov\w* let|\blety?\b/, 'vyhliadkove-lety'],
  [/mushing|ctyrkolk|stvorkolk|buggy|hummer|autoskola|supersport|ferrari|lambo|mustang|okruh|rolb|jizd|jazd|rizeni|riaden|spolujizd|spolujazd|pronajem-vozu|prenajom|formule|formula|simulator/, 'zazitkove-jazdy'],
  [/bungee|lezeni|lezen|jump-aren|jump|via-ferrat|lanov|skok/, 'lanove-centra'],
  [/paintball|laser-game|\blaser\b/, 'paintball-a-lasergame'],
  [/strelb|strelnic|airsoft|zbran/, 'strelba-na-strelnici'],
  [/venkovni-unikov|venkovni-hry|chytre-venkovni|city-quest/, 'vonkajsie-hry'],
  [/unikov/, 'escape-room'],
  [/potapeni|potapan|jachting|vodni|vodne|kajak|rafting|raft|splav|plavb|surf/, 'vodne-zazitky'],
  [/lyzov|lyziar|zimni|zimne|rolba|sjezd|snowboard|bruslen|korcul/, 'zimne-sporty'],
  [/badminton|sport|fitness|cviceni|joga/, 'sport-a-pohyb'],
  [/cirkus/, 'cirkus'],
  [/cirkus|prohlidka|prehliadk|vstric-historii|exhibition|muzeum|vystav|hrad|zamek|zamok|harry-potter|divadl|koncert/, 'kultura-a-vylety'],
  [/pivni-lazne|pivni-pobyt|pivni-hotel/, 'wellness-pobyty'],
  [/degustac|vino|alkohol|pivni|pivo|tvrdy|napoje|nealkohol|cajova|whisk|rum\b|gin\b/, 'degustacia-vina-a-piva'],
  [/sushi/, 'sushi'],
  [/pizza|burger|spaget|testovin|cestovin|empanad|restaur|voucher-do-restauraci|sety|gurman|jidlo|jedlo|menu|obed|vecere|vecera|steak|raňajk|ranajk/, 'otvorene-vouchery-do-restauracii'],
  [/lymfat|maderoterap|celulit|anticelul/, 'lymfodrenaz'],
  [/thajsk|thajske/, 'thajske-masaze'],
  [/tantra/, 'tantricke-masaze'],
  [/masaz|uvolnujici|relax-pro-telo|doprejte-si-relax|ulevte-si-od-bolesti|permanentka-na-tri/, 'masaze'],
  [/dentalni|zub|beleni|hygien/, 'starostlivost-o-zdravie'],
  [/head-spa/, 'head-spa'],
  [/kadernic|kadernict|vlas|keratin|shinique|strih/, 'kadernictvo'],
  [/kosmet|kozmet|plet|peeling|hifu|thermage|omlazen|omladz|liceni|licen|make-up|aknozn|karbonov|depilac|mihalnic|obocie|manikur|pedikur|necht/, 'kozmeticke-sluzby'],
  [/krasa|relax\b|wellness-a-krasa|bryle/, 'wellness-a-krasa'],
  [/wellness|sauna|virivk|lazne|kupel|spa\b/, 'wellness-pobyty'],
  [/foceni|foten|fotokn|atelier/, 'fotenie'],
  [/kovarsk|tanecni|tanecn|kurz/, 'kurzy'],
  [/valentyn|valentin/, 'valentinske-pobyty'],
  [/romantik|pro-dva|pre-dvoch|pre-dva|rozlucka/, 'pobyty-pre-dvoch'],
  [/s-detmi|detsky|prazdniny|rodin/, 'pobyty-s-detmi'],
  [/bez-deti/, 'pobyty-bez-deti'],
  [/prodlouzeny-vikend|vikend|long-weekend|svatky/, 'vikendove-pobyty'],
  [/na-horach|hory|hotel-na-horach/, 'dovolenka-na-horach'],
  [/chata|chalup|kemp/, 'chaty-a-chalupy'],
  [/penzion/, 'penziony'],
  [/luxusni|luxusn|chateau|resort|kastiel/, 'luxusne-ubytovanie'],
  [/netradicni|netradicn|glamping|tiny|iglu/, 'netradicne-ubytovanie'],
  [/pobyt|hotel|ubytovan|typ-ubytovani|dovolen|nocleh|noclah|apartm|vyborne|skvele-85|travelking|personal/, 'pobyty'],
  [/black-friday|darkov|bedny|truhly|poukaz|voucher|zbozi|potraviny|drogerie|doplnk|bytove|domacnost|hracky|plavky|saty|satky|damske|goji|yuzee|cascara|vitamin|fotoknihy|detsky-pokoj|army|letenky|pro-koho|pro-jednoho|auto-moto/, 'zazitkove-darceky'],
];
function ascii(s: string): string { return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
/** the closest live category for an unknown path (old tags, categories, dead offers); services first, then places */
export function fallbackTarget(path: string): string {
  const t = ascii(path.replace(/\/page\/\d+\/?$/, ''));
  if (/^hotel-[a-z0-9-]{2,18}$/.test(t)) return D('dovolenka-pri-mori'); // old Slevomat hotels abroad (Greece, Bulgaria …)
  for (const [re, to] of THEME) if (re.test(t)) return D(to);
  for (const [re, to] of GEO) if (re.test(t)) return D(to);
  return D('zazitky');
}
export function themeTarget(slug: string): string { return fallbackTarget(slug); }
/** Like fallbackTarget, but null when nothing matches — an unknown URL then answers a real 404 (no soft 404 to a section). */
export function matchTarget(path: string): string | null {
  const t = ascii(path.replace(/\/page\/\d+\/?$/, ''));
  if (/^hotel-[a-z0-9-]{2,18}$/.test(t)) return D('dovolenka-pri-mori');
  for (const [re, to] of THEME) if (re.test(t)) return D(to);
  for (const [re, to] of GEO) if (re.test(t)) return D(to);
  return null;
}
