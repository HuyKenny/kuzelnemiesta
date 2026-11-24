-- Blog post 24. 11. 2026: Champions League trip guide (Munich, Milan, Tehelné pole). Content migration: the site is static
-- since 23. 11. 2026 (no remote D1), the nightly/quick build applies pending migrations to the restored state (scripts/static/build.py).
-- One contextual sister link: ziveprenosy.sk/futbal/liga-majstrov/ (seo/linkbuilding/graf.md in the workspace). Photo: Red Nguyen / Pexels 27110089.
DELETE FROM posts WHERE type = 'post' AND slug = 'vylet-na-zapas-ligy-majstrov';
INSERT INTO posts (id, type, slug, title, content_html, excerpt, published_at, modified_at, cat_id, image, image_card, image_alt, image_w, image_h, author, seo_title, seo_desc, offers_cat, status)
SELECT MAX(id) + 1, 'post', 'vylet-na-zapas-ligy-majstrov', 'Výlet na zápas Ligy majstrov: ako kúpiť lístky, kam ísť a čo vidieť v meste', '<p>Večer pod reflektormi, hymna Ligy majstrov a štadión plný ľudí. Kto to raz zažil naživo, vie, že televízia to nenahradí. Zo Slovenska to pritom na viacero veľkých štadiónov nie je ďaleko a zápas sa dá spojiť s predĺženým víkendom v meste. Táto sezóna má navyše domáci bonus: Slovan Bratislava hrá ligovú fázu, takže na Tehelné pole prichádzajú súperi, akých tu bežne nevidíme.</p>

<h2>Kedy sa Liga majstrov hrá a ako si vybrať termín</h2>
<p>Od sezóny 2024/25 sa Liga majstrov hrá v novom formáte. Namiesto skupín je jedna ligová fáza s 36 tímami, v ktorej každý klub odohrá osem zápasov, štyri doma a štyri vonku. Hrá sa spravidla v utorok a v stredu, výkopy sú o 18:45 a o 21:00. Ligová fáza sa začína v septembri a končí sa v januári. Posledné kolo pripadá na stredu 27. januára 2027 a všetky jeho zápasy sa začínajú v rovnakom čase.</p>
<p>Potom prichádza vyraďovacia časť: play-off vo februári, osemfinále v marci, štvrťfinále v apríli a semifinále na prelome apríla a mája. Finále sa odohrá v sobotu 5. júna 2027 na Estadio Metropolitano v Madride.</p>
<p>Pri plánovaní pomáha držať sa poradia. Najprv si vyberte konkrétny zápas, potom riešte lístky a až nakoniec dopravu a hotel. Aktuálny <a href="https://ziveprenosy.sk/futbal/liga-majstrov/">program zápasov Ligy majstrov</a> s časmi výkopov a výsledkami nájdete na ziveprenosy.sk. Ubytovanie rezervujte s bezplatným stornom, pretože termín zápasu sa môže výnimočne zmeniť a vo vyraďovacej časti poznáte súpera len pár týždňov vopred.</p>

<h2>Ako kúpiť lístky oficiálne</h2>
<p>Na zápasy ligovej fázy aj vyraďovacej časti predávajú lístky domáce kluby, nie UEFA. Tá predáva cez svoj web len lístky na finále. Pravidlo je preto jednoduché: kupujte na oficiálnom webe klubu alebo u predajcu, ktorého klub sám uvádza.</p>
<ul>
<li><strong>Účet si založte vopred.</strong> Veľké kluby predávajú najprv členom a držiteľom permanentiek. Do voľného predaja sa na atraktívne zápasy dostane málo lístkov, preto sa zaregistrujte hneď, ako poznáte súpera.</li>
<li><strong>Lístok na meno.</strong> V Taliansku sú vstupenky povinne na meno a pri vstupe môžete ukazovať doklad totožnosti. Personalizované lístky majú aj iné kluby, takže lístok z neoverenej burzy vám pri turnikete nemusí pomôcť.</li>
<li><strong>Sektor hostí.</strong> Ak idete fandiť hosťom, lístky do ich sektora predáva hosťujúci klub zo svojho prídelu. Fanúšikovia Slovana teda na zápasy vonku kupujú cez Slovan.</li>
<li><strong>Oficiálna burza.</strong> Niektoré kluby majú vlastný sekundárny predaj, kde ponúkajú lístky držitelia permanentiek, ktorí nemôžu prísť. Je to bezpečnejšie ako weby, ktoré predávajú za násobok nominálnej ceny.</li>
</ul>
<p>Podrobnejšie sme to rozpísali v sprievodcovi, <a href="/listky-na-fc-barcelona-kompletny-sprievodca-ako-sa-dostat-na-zapas-a-nenaletiet-podvodnikom/">ako kúpiť lístky na FC Barcelona a nenaletieť podvodníkom</a>. Rovnaké zásady platia pri každom veľkom klube. Ak nechcete nič z toho riešiť sami, pozrite si <a href="/zajazdy-na-ligu-majstrov/">zájazdy na Ligu majstrov</a>, v ktorých je lístok súčasťou balíka.</p>

<h2>Mníchov: Allianz Arena a predvianočné mesto</h2>
<p>Bayern hrá domáce zápasy v Allianz Arene na severnom okraji mesta. Pri európskych zápasoch sa do nej zmestí viac ako 70 000 divákov. Z centra sa k nej dostanete metrom U6 na stanicu Fröttmaning, odkiaľ je to k štadiónu pešo asi 15 minút. Po zápase počítajte s tým, že stanica je preplnená a odchod trvá.</p>
<p>Z Bratislavy trvá cesta vlakom s prestupom vo Viedni približne päť až šesť hodín, autom zhruba päť. V Rakúsku potrebujete diaľničnú známku, v Nemecku osobné autá mýto neplatia. Lístky na Ligu majstrov predáva Bayern prednostne svojim členom. Ak členom nie ste, sledujte predaj a burzu na webe klubu, prípadne zvoľte zájazd s lístkom.</p>
<p>Pri decembrovom kole zažijete aj vianočný trh na Marienplatzi, ktorý tradične beží od konca novembra do Štedrého dňa. Cez deň stojí za to Viktualienmarkt, Anglická záhrada a múzeum FC Bayern priamo v aréne, ktoré sa dá spojiť s prehliadkou štadióna.</p>

<h2>Miláno: San Siro a večer na Navigli</h2>
<p>Štadión Giuseppe Meazza, ktorý všetci volajú San Siro, má približne 75 000 miest a delia sa oň Inter aj AC Miláno. V tejto sezóne tu Ligu majstrov hrá Inter. K štadiónu vás dovezie metro M5 na stanicu San Siro Stadio. Zo Slovenska je najrýchlejšia cesta letecky z Viedne alebo z Bratislavy, podľa toho, ktoré linky práve lietajú.</p>
<p>Pri kúpe dbajte na to, aby bol lístok na vaše meno, a doklad majte pri sebe. Pred zápasom si prejdite Dóm, galériu Viktora Emanuela II. a večer štvrť Navigli s kanálmi a barmi. Na San Sire je aj múzeum s prehliadkou štadióna, tú si však naplánujte na iný deň ako zápas.</p>

<h2>Bratislava: Liga majstrov na Tehelnom poli</h2>
<p>Pre fanúšikov zo stredu a z východu Slovenska je najbližšou možnosťou Národný futbalový štadión na Tehelnom poli s kapacitou približne 22 500 miest. Slovan na ňom podľa programu UEFA hostí v stredu 9. decembra 2026 Šachtar Doneck a v poslednom kole 27. januára 2027 Inter Miláno. Lístky predáva klub cez svoj oficiálny predaj.</p>
<p>Z Košíc trvá cesta vlakom do Bratislavy približne päť hodín, preto sa oplatí prespať a spojiť zápas s mestom. V decembri lákajú <a href="/vianocne-trhy-bratislava/">vianočné trhy v Bratislave</a> na Hlavnom, Františkánskom a Hviezdoslavovom námestí, cez deň Bratislavský hrad a uličky Starého Mesta.</p>

<h2>Praktické tipy pred cestou</h2>
<ul>
<li>Na štadión príďte aspoň hodinu pred výkopom. Kontroly pri vstupe sú dôkladné a veľké batohy často dnu nepustia, úschovňa pri štadióne nemusí byť.</li>
<li>Pri výkope o 21:00 sa zápas končí okolo 23:00. Ak necestujete z blízka, ubytovanie rátajte vždy.</li>
<li>Pozrite si pravidlá štadióna pre platby. Niektoré arény berú v bufetoch iba kartu.</li>
<li>V zimných kolách sa oblečte teplo. Na tribúne dve hodiny takmer stojíte na mieste a v januári je večer poriadna zima.</li>
</ul>', 'Kedy sa Liga majstrov hrá, ako kúpiť lístky oficiálne a ako spojiť zápas v Mníchove, Miláne alebo v Bratislave s víkendom v meste.', '2026-11-24 20:30:00', '2026-11-24 20:30:00', 1528, '/wp-content/uploads/2026/11/vylet-na-zapas-ligy-majstrov-27110089.webp', '/wp-content/uploads/2026/11/vylet-na-zapas-ligy-majstrov-27110089-768x432.webp', 'Výlet na zápas Ligy majstrov: ako kúpiť lístky, kam ísť a čo vidieť v meste – foto: Red Nguyen / Pexels', 1200, 675, 'Kúzelné miesta', 'Výlet na zápas Ligy majstrov: lístky, doprava a tipy', 'Ako si zo Slovenska naplánovať výlet na Ligu majstrov: kedy sa hrá, kde kúpiť oficiálne lístky, doprava do Mníchova, Milána aj na Tehelné pole a čo vidieť.', 'zajazdy-na-ligu-majstrov', 'publish' FROM posts;
INSERT OR REPLACE INTO slugs (slug, kind, ref_id) SELECT slug, 'post', id FROM posts WHERE type = 'post' AND slug = 'vylet-na-zapas-ligy-majstrov';
DELETE FROM redirects WHERE from_path = '/vylet-na-zapas-ligy-majstrov/';
INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
