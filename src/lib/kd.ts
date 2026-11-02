// Texts and rules of the WordPress child theme (rehub-child functions.php + mu-plugin kd-redirects.php, 30. 10. 2026),
// ported verbatim: category FAQ and intros by section, city × category intros, the 404 → category heuristic.
import { cislo } from './format';

export type Kind = 'pobyt' | 'zazitek' | 'restaurace' | 'krasa' | 'kurz' | 'obecne';
// sections of the redesign v2 tree (src/data/taxonomie.json)
const ROOT_KIND: Record<string, Kind> = { pobyty: 'pobyt', zazitky: 'zazitek', 'jidlo-a-piti': 'restaurace', 'wellness-a-krasa': 'krasa', kurzy: 'kurz' };
/** kd_category_kind(): by the slug of the root category. */
export const kindOf = (rootSlug: string): Kind => ROOT_KIND[rootSlug] ?? 'obecne';

const SAFE = 'Kouzelný děda je rozcestník nabídek. Po kliknutí přejdete přímo k ověřenému partnerovi, kde objednávku dokončíte v jeho zabezpečeném prostředí. Cena pro vás zůstává stejná.';

export function categoryFaq(name: string, kind: Kind): Array<{ q: string; a: string }> {
  const n = name.toLowerCase();
  switch (kind) {
    case 'pobyt': return [
      { q: `Jak vybrat ten správný pobyt v kategorii ${n}?`, a: 'Seřaďte nabídky podle ceny, obliby nebo nejnovějších a využijte filtr ceny. U každého pobytu vidíte lokalitu, co je v ceně, původní i zvýhodněnou cenu a úsporu v korunách. Termíny a kapacity se rychle mění, proto se vyplatí rezervovat s předstihem.' },
      { q: 'Co bývá zahrnuto v ceně pobytu?', a: 'Podle konkrétní nabídky nejčastěji ubytování se snídaní či polopenzí, vstup do wellness, parkování nebo dítě zdarma. Přesný rozsah vždy najdete v detailu nabídky u partnera.' },
      { q: 'Jak rezervace probíhá a je bezpečná?', a: SAFE },
      { q: 'Dá se pobyt darovat nebo má otevřený termín?', a: 'Řadu pobytů lze pořídit jako dárkový voucher s delší platností, u kterého si termín vyberete později. Hodí se tak skvěle jako dárek. Podmínky platnosti uvádí každá nabídka.' },
    ];
    case 'zazitek': return [
      { q: `Jak vybrat ten pravý zážitek v kategorii ${n}?`, a: 'Filtrujte podle ceny a lokality a porovnejte varianty. U každého zážitku vidíte, co obnáší, původní i zvýhodněnou cenu a úsporu v korunách. Myslete i na to, pro koho zážitek je – jinou náladu má adrenalin a jinou wellness.' },
      { q: 'Kolik zážitky stojí a jak se počítá cena?', a: 'Ceny se liší podle typu zážitku. Sbíráme zvýhodněné nabídky a dárkové vouchery od prověřených partnerů, takže u většiny zážitků vidíte původní cenu i spočítanou úsporu.' },
      { q: 'Jak nákup probíhá a je bezpečný?', a: SAFE },
      { q: 'Dá se zážitek darovat?', a: 'Většina zážitků se pořizuje formou dárkového voucheru, často s otevřenou platností. Obdarovaný si pak sám zvolí termín – ideální dárek na poslední chvíli i s předstihem.' },
    ];
    case 'restaurace': return [
      { q: `Jak vybrat podnik v kategorii ${n}?`, a: 'Porovnejte lokalitu, typ kuchyně a co je v nabídce zahrnuto. U každé nabídky vidíte původní i zvýhodněnou cenu a úsporu v korunách, takže snadno vyberete podle chuti i rozpočtu.' },
      { q: 'Jak fungují vouchery do restaurací?', a: 'Většinou jde o zvýhodněné menu nebo degustace za pevnou cenu. Rozsah (počet chodů, nápoje, počet osob) i platnost najdete v detailu konkrétní nabídky u partnera.' },
      { q: 'Jak nákup probíhá a je bezpečný?', a: SAFE },
      { q: 'Musím rezervovat termín dopředu?', a: 'U gastro nabídek se rezervace termínu doporučuje – konkrétní postup a platnost voucheru uvádí každá nabídka. Často poslouží i jako dárek.' },
    ];
    case 'krasa': return [
      { q: `Jak vybrat proceduru v kategorii ${n}?`, a: 'Filtrujte podle ceny a lokality a porovnejte salony i rozsah procedury. U každé nabídky vidíte původní i zvýhodněnou cenu a úsporu v korunách, takže snadno vyberete tu pravou.' },
      { q: 'Co bývá v ceně a jak dlouho procedura trvá?', a: 'Délka i rozsah se liší podle nabídky – od krátkého ošetření po několikahodinové balíčky. Přesný obsah a délku najdete v detailu nabídky u partnera.' },
      { q: 'Jak nákup probíhá a je bezpečný?', a: SAFE },
      { q: 'Dá se procedura darovat?', a: 'Ano, většinu procedur lze pořídit jako dárkový voucher s delší platností. Skvěle se hodí jako dárek – obdarovaný si termín vybere sám.' },
    ];
    case 'kurz': return [
      { q: `Jak vybrat kurz v kategorii ${n}?`, a: 'Porovnejte délku kurzu, počet účastníků, místo konání a co je v ceně (materiál, ochutnávka, certifikát). U každé nabídky vidíte původní i zvýhodněnou cenu a úsporu v korunách.' },
      { q: 'Je kurz vhodný pro začátečníky?', a: 'Většina kurzů je určená začátečníkům i mírně pokročilým — lektor vás vším provede. Úroveň a požadavky najdete v detailu nabídky u partnera.' },
      { q: 'Jak nákup probíhá a je bezpečný?', a: SAFE },
      { q: 'Dá se kurz darovat?', a: 'Ano, kurzy jsou oblíbený zážitkový dárek. Pořídíte je jako voucher s delší platností a obdarovaný si termín vybere sám.' },
    ];
    default: return [
      { q: `Jak vybrat tu správnou nabídku v kategorii ${n}?`, a: 'Seřaďte nabídky podle ceny, obliby nebo nejnovějších a využijte filtr ceny. U každé nabídky vidíte původní i zvýhodněnou cenu, úsporu v korunách. Nabídky denně doplňujeme.' },
      { q: 'Kolik nabídky stojí a jak se počítá cena?', a: 'Ceny se liší podle typu nabídky a termínu. Sbíráme zvýhodněné nabídky a dárkové vouchery od prověřených partnerů, takže u většiny vidíte původní cenu i spočítanou úsporu.' },
      { q: 'Jak nákup probíhá a je bezpečný?', a: SAFE },
      { q: 'Dají se nabídky darovat?', a: 'Většinu nabídek lze pořídit formou dárkového voucheru, často s delší platností. Jsou tak ideální jako dárek.' },
    ];
  }
}

export function categoryIntro(name: string, kind: Kind): string {
  switch (kind) {
    case 'pobyt': return `Vybíráte v kategorii ${name}? Porovnejte lokalitu, co je v ceně i hodnocení a sledujte úsporu v korunách. Nejvýhodnější pobyty mizí rychle, vyplatí se proto rezervovat včas. Po kliknutí přejdete k ověřenému partnerovi, cena se nemění.`;
    case 'zazitek': return `Hledáte v kategorii ${name} ten pravý zážitek? Vyberte podle ceny, lokality i toho, pro koho zážitek je. U každé nabídky vidíte původní cenu i úsporu a většinu zážitků pořídíte jako dárkový voucher s otevřenou platností. Po kliknutí přejdete k ověřenému partnerovi, cena zůstává stejná.`;
    case 'restaurace': return `Vybíráte v kategorii ${name}? Porovnejte typ kuchyně, lokalitu a co je ve voucheru zahrnuto. U každé nabídky vidíte zvýhodněnou cenu i úsporu. Po kliknutí přejdete k ověřenému partnerovi, kde objednávku dokončíte – cena se nemění.`;
    case 'kurz': return `Chcete se naučit něco nového nebo darovat kurz? V kategorii ${name} porovnáte lektory, délku i to, co je v ceně, a hned vidíte úsporu. Většinu kurzů pořídíte jako dárkový voucher s otevřeným termínem. Po kliknutí přejdete k ověřenému partnerovi, cena se nemění.`;
    case 'krasa': return `Hledáte v kategorii ${name} tu pravou péči? Porovnejte salony, rozsah procedury i hodnocení a sledujte úsporu v korunách. Skvělý tip i na dárek. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
    default: return `Vybíráte v kategorii ${name}? Porovnejte ceny i hodnocení a sledujte úsporu v korunách. Nabídky denně doplňujeme. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
  }
}

/** kd_combo_intro_html(): the longer category × city text (unique content of the combo landing). */
export function comboIntro(cat: string, lok: string, count: number, kind: Kind): string {
  const catl = cat.toLowerCase();
  const cnt = cislo(count);
  switch (kind) {
    case 'pobyt': return `Plánujete ${catl} ${lok} a okolí? Sesbírali jsme ${cnt} ověřených nabídek na jednom místě, ať nemusíte porovnávat desítky webů. U každého pobytu vidíte lokalitu, co je v ceně (snídaně či polopenze, vstup do wellness, parkování nebo dítě zdarma), původní i zvýhodněnou cenu a úsporu v korunách. Nejvýhodnější pobyty ${lok} mizí rychle, vyplatí se rezervovat s předstihem — a řadu z nich pořídíte jako dárkový voucher s otevřeným termínem. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
    case 'zazitek': return `Hledáte ${catl} ${lok}? Máme ${cnt} ověřených nabídek přehledně na jednom místě. Vyberte podle ceny, lokality i toho, pro koho má zážitek být — jinou náladu má adrenalin a jinou romantika či wellness. U každé nabídky vidíte úsporu v korunách a většinu zážitků ${lok} pořídíte jako dárkový voucher s otevřenou platností, takže skvěle poslouží i jako dárek. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
    case 'restaurace': return `Máte chuť na ${catl} ${lok}? Sesbírali jsme ${cnt} ověřených nabídek na jednom místě. Porovnáte typ kuchyně, lokalitu i to, co je ve voucheru zahrnuto (počet chodů, nápoje, počet osob), a hned vidíte zvýhodněnou cenu a úsporu v korunách. U gastro nabídek se hodí rezervovat termín předem; mnohé fungují i jako dárek. Po kliknutí přejdete k ověřenému partnerovi, kde objednávku dokončíte — cena pro vás zůstává stejná.`;
    case 'krasa': return `Hledáte ${catl} ${lok}? Máme ${cnt} ověřených nabídek přehledně na jednom místě. Porovnejte salony, rozsah a délku procedury i hodnocení a sledujte úsporu v korunách. Většinu procedur ${lok} pořídíte i jako dárkový voucher s delší platností — ideální dárek, u kterého si termín vybere obdarovaný. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
    default: return `Hledáte ${catl} ${lok}? Sesbírali jsme ${cnt} ověřených nabídek na jednom místě. Porovnejte ceny i hodnocení a sledujte úsporu v korunách; nabídky navíc denně doplňujeme. Řadu z nich pořídíte jako dárkový voucher s delší platností. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
  }
}

export function cityIntro(lok: string): string {
  return `Hledáte zážitky, pobyty nebo dovolenou ${lok}? Sebrali jsme pro vás ověřené nabídky na jednom místě — od wellness a romantiky po gastro a adrenalin. Porovnejte ceny i hodnocení a vyberte tu pravou. Po kliknutí přejdete k ověřenému partnerovi, cena pro vás zůstává stejná.`;
}

/** kd_service_cat_candidates(): category chips on a city page (shown when the combo has ≥ 40 offers). */
export const SERVICE_CATS: Array<[string, string]> = [
  ['masaze', 'Masáže'], ['zazitky', 'Zážitky'], ['restaurace-a-bary', 'Restaurace a bary'], ['krasa-zdravi-a-relaxace', 'Krása a relaxace'],
  ['kosmeticke-sluzby', 'Kosmetika'], ['sauna-a-wellness', 'Sauna a wellness'], ['adrenalinove-zazitky', 'Adrenalin'], ['degustacni-menu', 'Degustace'],
  ['kavarny', 'Kavárny'], ['pece-o-plet-a-oblicej', 'Péče o pleť'],
];

/** An unknown path (old WooCommerce category / location tag / offer slug that no longer exists) → the closest live category.
 *  Order matters, first match wins; the text is the lower-case ASCII path with "-" between words. Nothing here ends in a 404:
 *  the fallback is the section of the stay / experience. */
const D = (s: string) => `/${s}/`;
const GEO: Array<[RegExp, string]> = [
  // Czech regions and mountains first (names overlap with the foreign towns below)
  [/\b(jizni-morava|brno|znojmo|lednice|breclav|hnanice|velke-pavlovice|mikulov|hodonin)\b/, 'dovolena-jihomoravsky-kraj'],
  [/\b(jizni-cechy|cesky-krumlov|tabor|pisek|hartmanice|lipno)\b/, 'dovolena-jihocesky-kraj'],
  [/\b(severni-morava|ostrava|novy-jicin|slavicin|rapotin|frydlant|jesenik|jeseniky|karvina)\b/, 'dovolena-moravskoslezsky-kraj'],
  [/\b(stredni-cechy|benesov|kurim|caslav|kadan|decin|lysice|oponice|senohraby|adrspach|kvasetice)\b/, 'dovolena-stredocesky-kraj'],
  [/\b(zapadni-cechy|plzen|sumava|bavorsky-les|krusne-hory|nove-hamry)\b/, 'dovolena-plzensky-kraj'],
  [/\b(vysocina|jihlava|zdar|velichovky)\b/, 'dovolena-vysocina'],
  [/\b(praha|prague)\b/, 'dovolena-praha'],
  [/\b(liberec|jizerske-hory|harrachov|benecko|jablonec|doksy|cesky-raj|horni-libchavy|zlate-hory|jicin|krkonose)\b/, 'dovolena-liberecky-kraj'],
  [/\b(karlovy-vary|marianske-lazne|luhacovice)\b/, 'dovolena-karlovarsky-kraj'],
  [/\b(orlicke-hory|pardubice|letohrad|chrastovice)\b/, 'dovolena-pardubicky-kraj'],
  [/\b(hradec-kralove|bile-karpaty|frydlant)\b/, 'dovolena-hradecky-kraj'],
  [/\b(zlin|zlin-a-okoli|beskydy|pozlovice)\b/, 'dovolena-zlinsky-kraj'],
  [/\b(olomouc|jeseniky|jesenik)\b/, 'dovolena-olomoucky-kraj'],
  [/\b(chomutov|usti|teplice|jirkov|most)\b/, 'dovolena-ustecky-kraj'],
  [/\b(cesko|ceska-republika|cela-cr|domaci|dovolena-2025|dovolena-2026|leto-2025|jizni-cechy)\b/, 'dovolena-v-cesku'],
  // abroad: a country category when we have one, else the sea / abroad category
  [/\b(madarsko|budapest|balaton\w*|heviz\w*|sarvar|bukfurdo|harkany|mezokovesd|miskolctapolca|zalakaros|cserkeszolo|demjen|gyor|tiszaujvaros|szentgotthard|komarom|sopron|bogacs|ostrihom|eger|hajduszoboszlo|balmazujvaros|zalacsany|felcsut|gotthard)\b/, 'dovolena-madarsko'],
  [/\b(polsko|polske|kudowa\w*|kliczkow|krakov|gdansk|mezizdroje|vratislav|jeleni-hora|lehnice|bila|tatry|zakopane|baltske-more)\b/, 'dovolena-polsko'],
  [/\b(slovensko|zuberec|vrbov|liptov|orava|velka-fatra|besenova|bojnice|slovensky-raj|bratislava|nizke-tatry|vysoke-tatry|nesvady|velky-meder|nizke-taury|vysoke-taury|brezova|krakow)\b/, 'dovolena-slovensko'],
  [/\b(italie|grado|riccione|ischia|falcade|civetta\w*|val-di-fiemme|veneto|orbetello|rim|calella|lovran)\b/, 'dovolena-italie'],
  [/\b(chorvatsko|novigrad|vodice|istrie|dalmacie)\b/, 'dovolena-chorvatsko'],
  [/\b(rakousko|semmering|goldegg|grossarl|pertisau|korutany|salcbursko|muhlbach|linec|tyrolsko|alpy)\b/, 'dovolena-rakousko'],
  [/\b(slovinsko|lendava|kamnik|kolobreh)\b/, 'dovolena-slovinsko'],
  [/\b(nemecko|bad-griesbach|bad-muskau|langenfeld|papenburg|wedel|hamburk|mnichov|rujana|klink|dortmund|nahe)\b/, 'dovolena-nemecko'],
  [/\b(bulharsko|varna|carevo|primorsko|recko|kreta|kos|zakynthos|kefalonia|acharavi|paralia|hvd|hotel-[a-z]+|egypt|marsa-alam|tunisko\w*|djerba|turecko|spanelsko|katalansko|portugalsko|cerna-hora|albanie|francie|belgie|dansko|nizozemi|norsko|svycarsko|island|agia-napa|kypr|armenie|gruzie|indie|jordansko|oman|maroko|thajsko|vietnam|filipiny|indonesie|japonsko|kuba|mexiko|brazilie|peru|kostarika|tanzanie|uzbekistan|sri-lanka|spojene-staty|rumunsko|la-palma|male|sol-guadalupe|condesa|villa-ilex|koupani-v-mori|plavky-u-more)\b/, 'dovolena-u-more'],
];
const THEME: Array<[RegExp, string]> = [
  [/v-oblacich|dinner-in-the-sky/, 'vecere-v-oblacich'], [/preziti|survival/, 'kurzy-preziti'], [/barist|latte-art/, 'kurzy-baristy'], [/vrtulnik/, 'let-vrtulnikem'], [/letecky-simulator|boeing|airbus/, 'letecke-simulatory'],
  [/bungee|bunge-jump/, 'bungee-jumping'], [/skola-smyku|smyk/, 'kurzy-smyku-a-bezpecne-jizdy'], [/l-39|albatros|stihack/, 'let-stihackou'], [/rybar|rybol/, 'rybareni'], [/rozluck/, 'rozlucka-se-svobodou'], [/romanticka-vecere|vecere-pro-dva/, 'romanticka-vecere'],
  [/ferrari/, 'jizda-ve-ferrari'], [/lamborghini|lambo/, 'jizda-v-lamborghini'], [/porsche/, 'jizda-v-porsche'], [/mustang/, 'jizda-ve-fordu-mustang'], [/dodge|challenger/, 'jizda-v-dodge'], [/tatra|tatrou/, 'jizda-tatrou'],
  [/seskok|skydiv/, 'tandemovy-seskok'], [/paraglid/, 'paragliding'], [/vzducholod/, 'let-vzducholodi'], [/vetrny-tunel|volny-pad/, 'vetrny-tunel-a-volny-pad'], [/ferrat/, 'via-ferrata-zazitky'], [/jetpack|hoverboard|flyboard/, 'flyboarding-a-jetpack'],
  [/potap|freediving/, 'potapeni'], [/lukostrel/, 'lukostrelba-kurzy'], [/minigolf/, 'minigolf'], [/kviz|quiz/, 'hospodsky-kviz'], [/privatni-wellness|privatni-spa/, 'privatni-wellness'], [/tanecn|tanec-|salsa|bachata/, 'tanecni-kurzy'], [/koz[aeouy]?-|kozou|alpak/, 'prochazka-s-kozou-a-alpakami'],
  [/pivni-lazne|pivni-koupel/, 'pivni-lazne'], [/bugin|buggy|ctyrkol|offroad|atv/, 'bugiiny-a-ctyrkolky'],
  // services (old WooCommerce categories and long offer slugs)
  [/let-stihack|stihack|vetron|paraglid|balon|vyhlidkov\w* let|\blety?\b/, 'vyhlidkove-lety'],
  [/mushing|ctyrkolk|buggy|hummer|autoskola|supersport|ferrari|lambo|mustang|okruh|rolb|jizd|rizeni|spolujizd|pronajem-vozu|formule|simulator/, 'zazitkove-jizdy'],
  [/bungee|lezeni|jump-aren|jump|via-ferrat|lanov|skok/, 'lanova-centra'],
  [/paintball|laser-game|\blaser\b/, 'paintball-a-laser-game'],
  [/strelb|airsoft|zbran/, 'strelba'],
  [/venkovni-unikov|venkovni-hry|chytre-venkovni|city-quest/, 'venkovni-hry'],
  [/unikov/, 'unikove-hry'],
  [/potapeni|jachting|vodni|kajak|rafting|raft|plavb|surf/, 'vodni-zazitky'],
  [/lyzov|zimni|rolba|sjezd|snowboard|bruslen/, 'zimni-sporty'],
  [/badminton|sport|fitness|cviceni|joga/, 'sport-a-pohyb'],
  [/cirkus/, 'cirkus'],
  [/cirkus|prohlidka|vstric-historii|exhibition|muzeum|hrad|zamek|harry-potter/, 'kultura-a-vylety'],
  [/pivni-lazne|pivni-pobyt|pivni-hotel/, 'wellness-pobyty'],
  [/degustac|vino|alkohol|pivni|pivo|tvrdy|napoje|nealkohol|cajova|whisk|rum\b|gin\b/, 'degustace-vina-a-piva'],
  [/sushi/, 'sushi'],
  [/pizza|burger|spaget|testovin|empanad|restaur|voucher-do-restauraci|sety|gurman|jidlo|menu|obed|vecere/, 'vouchery-do-restauraci'],
  [/lymfat|maderoterap|celulit|anticelul/, 'lymfaticka-masaz'],
  [/thajsk|thajske/, 'thajske-masaze'],
  [/tantra/, 'tantra-masaze'],
  [/masaz|uvolnujici|relax-pro-telo|doprejte-si-relax|ulevte-si-od-bolesti|permanentka-na-tri/, 'masaze'],
  [/dentalni|zub|beleni|hygien/, 'pece-o-zdravi'],
  [/head-spa/, 'head-spa'],
  [/kadernic|vlas|keratin|shinique/, 'kadernictvi-a-barber'],
  [/kosmet|plet|peeling|hifu|thermage|omlazen|liceni|make-up|aknozn|karbonov|depilac/, 'kosmetika'],
  [/krasa|relax\b|wellness-a-krasa|bryle/, 'wellness-a-krasa'],
  [/wellness|sauna|virivk|lazne|spa\b/, 'wellness-pobyty'],
  [/foceni|fotokn|atelier/, 'foceni'],
  [/kovarsk|tanecni|kurz/, 'kurzy'],
  [/valentyn/, 'valentynske-pobyty'],
  [/romantik|pro-dva|rozlucka/, 'pobyty-pro-dva'],
  [/s-detmi|detsky|prazdniny|rodin/, 'rodinne-pobyty'],
  [/bez-deti/, 'pobyty-bez-deti'],
  [/prodlouzeny-vikend|vikend|long-weekend|svatky/, 'vikendove-pobyty'],
  [/na-horach|hory|hotel-na-horach/, 'pobyty-na-horach'],
  [/chata|chalup|kemp/, 'chaty-a-chalupy'],
  [/penzion/, 'penziony'],
  [/luxusni|chateau|resort/, 'luxusni-hotely'],
  [/netradicni|glamping|tiny|iglu/, 'netradicni-ubytovani'],
  [/pobyt|hotel|ubytovan|typ-ubytovani|dovolen|nocleh|apartm|vyborne|skvele-85|travelking|personal/, 'pobyty'],
  [/black-friday|darkov|bedny|truhly|poukaz|voucher|zbozi|potraviny|drogerie|doplnk|bytove|domacnost|hracky|plavky|saty|satky|damske|goji|yuzee|cascara|vitamin|fotoknihy|detsky-pokoj|army|letenky|pro-koho|pro-jednoho|auto-moto/, 'zazitkove-darky'],
];
function ascii(s: string): string { return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
/** the closest live category for an unknown path (old tags, categories, dead offers); services first, then places */
export function fallbackTarget(path: string): string {
  const t = ascii(path.replace(/\/page\/\d+\/?$/, ''));
  if (/^hotel-[a-z0-9-]{2,18}$/.test(t)) return D('dovolena-u-more'); // old Slevomat hotels abroad (Greece, Bulgaria …)
  for (const [re, to] of THEME) if (re.test(t)) return D(to);
  for (const [re, to] of GEO) if (re.test(t)) return D(to);
  return D('zazitky');
}
export function themeTarget(slug: string): string { return fallbackTarget(slug); }
