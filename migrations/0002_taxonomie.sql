-- Redesign v2 (31. 10. 2026): new category tree (src/data/taxonomie.json, applied by scripts/taxonomie-apply.py),
-- feed-category aliases for the importer and gift landings (slugs kind 'gift').
ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN grp TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN short TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;

-- feed category path → category: "<root name>|<child name>" in lower case ("|cestování", "cestování|wellness dovolená")
CREATE TABLE cat_alias (
  feed_key TEXT PRIMARY KEY,
  cat_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- slugs: allow gift landings (SQLite cannot alter a CHECK → rebuild)
CREATE TABLE slugs_new (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('product','category','post','page','postcat','gift')),
  ref_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
INSERT INTO slugs_new SELECT slug, kind, ref_id FROM slugs;
DROP TABLE slugs;
ALTER TABLE slugs_new RENAME TO slugs;
