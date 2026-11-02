# Architektura

```
kouzelnydeda.cz/*, www → Worker "kouzelnydeda" (Astro SSR)
  middleware.ts: host allow-list → Access (staging) → jeden 301 (www, velká písmena, WP báze, lomítko, tabulka redirects
                 vč. Pretty Links 307) → Cache API (klíč data_version + BUILD_ID, 600 s) → bezpečnostní hlavičky + CSP s nonce
  [...path].astro → lib/dispatch.ts: slugs (nabídka | kategorie | článek | stránka | rubrika blogu), /<kat>/lokalita/<mesto>/,
                    /lokalita/<mesto>/, /brand/<partner>/, /blog/; neznámý slug → jednoznačné pokračování, /<nabídka>-2/,
                    tematická sekce (kd_theme_target), jinak 404
  /go/<id>/ → 302 na partnera (allow-list hostů, boti 204, klik do D1 = oblíbenost)
Worker "kouzelnydeda-import" (cron */20): další feed na řadě → po 3:00 UTC jednou denně finalizace
```

## Data (D1)
- `products` = nabídky (WP ID a slugy zachované). `source` + `ext_id` = klíč feedu (Slevomat ID, Adrop ITEMGROUP_ID,
  Zážitky ID). `info` = strukturovaná data feedu pro detail (popis, highlights, poskytovatel, platnost, varianty…).
- `cat_products` = členství AKTIVNÍCH nabídek rozbalené na předky + řadicí klíče (cena, sleva, oblíbenost, město).
- `categories` (product_cat, `canon_id` = stejnojmenný duplikát → hlavní), `lokality` (pa_lokalita), `stores`, `posts`,
  `post_categories`, `redirects`, `clicks`, `site_cache` (sitemapy, `combos`, `data_version`), `product_fts`.

## Import (náhrada WP All Import)
- Filtry a mapování 1:1 s importy 25/26/27/28 (`workers/import/src/feeds.ts`, `parse.ts`): Slevomat bez Zboží/Fotodárků/
  Potravin/Praktických/kurzů, cestování pod „Cestování“; Adrop bez hmotných dárků/triček/poukazů, varianta = nejlevnější
  položka ITEMGROUP_ID; Zážitky vše. Affiliate URL přesně jako WPAI (Slevomat UTM, eHub desturl nekódované).
- Kategorie: kořen + děti z CATEGORIES (hierarchie WPAI), neznámé se založí. Ručně přidané kategorie z WP zůstávají.
- Slug nové nabídky = WordPress `sanitize_title`, při změně názvu se NEMĚNÍ (WP slug měnil → 2 800 starých slugů v redirects).
- Pojistky: zápis jen změn (`content_hash`), > 40 % zmizelých = `suspicious` a nic se nevypne, max 2 500 zápisů na běh
  (`partial`, další běh hned pokračuje).
- **Skončená nabídka** (zmizí z feedu): `active = 0`, z výpisů pryč, stránka 30 dní 200 + „Tato nabídka už skončila“ +
  podobné nabídky, `noindex`; pak 301 na kategorii. Vrátí-li se do feedu, ožije pod stejnou URL.

## SEO 1:1 s WordPressem
- Titulky/popisky: šablony child theme (`src/lib/seo.ts`, `src/lib/kd.ts` — FAQ, intro, kombinace města, texty doslova);
  články a stránky = otisk živého webu (`live-meta.json`). Nabídky `{název} | Kouzelný děda`, popis = excerpt.
- Záměrné rozdíly: stránkování má „– strana N“, rubriky blogu mají H1 a popis, popisky Adropu/Zážitků bez emoji nadpisu.
- Parita 30. 10. 2026 (1 347 URL ze snapshotu): ~90 % shodných tvrdých polí, zbytek viz výše + čísla nabídek v popiscích.
- Externí odkazy v článcích se NEMĚNÍ (prodané odkazy zůstávají dofollow); affiliate odchody `rel="nofollow sponsored"`.
- robots.txt pouští AhrefsBot/SemrushBot/MJ12bot (kupci odkazů si jimi ověřují dofollow), blokuje Baidu/Dot/Petal/BLEX.

## Vzhled „Poukázka“
Bílá, inkoustově fialová, jedna barva z kouzelníkova klobouku (`#4b1fb0`), zlatá jen na úsporu. Karta nabídky =
poukázka s perforovaným útržkem se slevou. Systémové písmo, jeden CSS (`src/styles/app.css`), fotky partnerů přes
wsrv.nl (nic se neukládá na Cloudflare), fotky článků v `public/wp-content/uploads/` (83 MB, stejné URL jako WP).

## Redesign v2 „Kouzelná poukázka“ (31. 10. 2026)
- **Strom kategorií** = `src/data/taxonomie.json` (81 uzlů, 6 sekcí: Pobyty, Zážitky, Wellness a krása, Jídlo a pití, Kurzy +
  Dárky). Starý strom Slevomatu (249 kategorií, 58 duplicit) nahradil `scripts/taxonomie-apply.py <env>` (migrace 0002): nová ID
  od 300000, 301 ze všech starých kategorií (+ `page/N` a `/<stará>/lokalita/<město>/` řeší dispatch), členství nabídek přepočtené.
  Slugy podle hledanosti MM (glamping 28k, sushi 37k, kosmetika 40k, wellness pobyty 6,8k). Změna stromu = upravit JSON + nová
  migrace/skript, ne ruční SQL.
- **Import** zařazuje přes `cat_alias` („kořen|název“ z feedu → kategorie). Nový název z feedu se NEzaloží — jde do sekce
  a do `site_cache 'cat:unmapped'` (`GET /status` import Workeru) → doplnit do `taxonomie.json` (`from`) a znovu aplikovat alias.
  Goods-like deals Slevomatu (Jídlo s sebou, Rozvoz, Delikatesy) se neimportují.
- **Dárkové landingy** `src/data/darky.json` (slugs kind `gift`): výběr z kategorií + cenový strop, vlastní title/desc/intro.
- **Identita z Canvy:** překreslený kouzelník (`public/a/kouzelnik-*.webp`, `kouzelnik-darek-*`), logo = kouzelník + nápis
  Gabarito (`public/a/logo-264|528.webp`, `logo-512.png`), favicony, `og.jpg`, 10 ilustrací `public/a/il/*.webp`. Zdroj:
  Canva design „Blank square illustration holder“ (DAHXx6BooKA) strany 3–12, export PNG → ořez `tmp/alkoholicky/canva/cut.py`.
- **Ikony** = vlastní linkový sprite `public/a/i2.svg` (73 symbolů, `<Ik n=…>`); při změně přejmenovat soubor (immutable cache).
- **Konverze:** karta má vedle odkazu na detail tlačítko „K nabídce“ přímo na `/go/` (`ctx` karta/detail/sezona/…), detail má
  lepicí box „Koupit na <partner>“ + na mobilu stálou lištu s cenou. GA4 `affiliate_click.context` = ctx.
