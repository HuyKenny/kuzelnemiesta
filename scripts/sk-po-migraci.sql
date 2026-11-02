-- Zlavomat category names the old SK WordPress tree did not know (first staging import 2. 11. 2026) → nodes of the new tree.
-- Run after scripts/taxonomie-apply.py + kategorie-pridat.py: wrangler d1 execute DB --env <env> --remote --file scripts/sk-po-migraci.sql
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'krása, zdravie a relaxácia|tantrické masáže', id FROM categories WHERE slug = 'tantricke-masaze';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|šport', id FROM categories WHERE slug = 'sport-a-pohyb';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'reštaurácie a bary|bary a drinky', id FROM categories WHERE slug = 'bary-a-drinky';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|motokáry', id FROM categories WHERE slug = 'motokary';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|ryby a morské plody', id FROM categories WHERE slug = 'jedlo-a-pitie';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'reštaurácie a bary|tatarák', id FROM categories WHERE slug = 'tatarsky-biftek';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'reštaurácie a bary|delikatesy', id FROM categories WHERE slug = 'jedlo-a-pitie';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|soľná jaskyňa', id FROM categories WHERE slug = 'solna-jaskyna';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|jazda na okruhu', id FROM categories WHERE slug = 'jazda-na-okruhu';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|striptíz', id FROM categories WHERE slug = 'striptiz';
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'zážitky|darčekové poukážky plné krásy', id FROM categories WHERE slug = 'wellness-a-krasa';
-- partner names with the Slovak spelling (WordPress had 'Zlavomat.sk')
UPDATE stores SET name = 'Zľavomat.sk' WHERE slug = 'zlavomat-sk';
-- the old WordPress category "Wellness s večerou" is a node again (best GSC page of the old site, 3. 11. 2026)
INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) SELECT 'krása, zdravie a relaxácia|wellness s večerou', id FROM categories WHERE slug = 'wellness-s-vecerou';
DELETE FROM redirects WHERE from_path = '/wellness-s-vecerou/';
-- 404s found by Cloudflare after the cutover with a short slug (< 15 chars, so dispatch does not guess) → category, 3. 11. 2026
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/nocny-let/', '/vyhliadkove-lety/', 301);
-- content gap 3. 11. 2026: old URLs that sent equity to the wrong page now go to their real target
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/pobyty-v-tatrach/', '/pobyty-vo-vysokych-tatrach/', 301);
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/wellness-pobyty-pre-dvoch/', '/wellness-pre-dvoch/', 301);
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/pobyty-a-dovolenky-pre-zenu/', '/wellness-pobyty-pre-zeny/', 301);
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/darcekova-poukazka/', '/darcekovy-poukaz/', 301);
INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ('/kacacie-a-husacie-hody/', '/husacie-hody/', 301);
DELETE FROM redirects WHERE from_path IN ('/masaz-pre-dvoch/', '/bardejovske-kupele/');
