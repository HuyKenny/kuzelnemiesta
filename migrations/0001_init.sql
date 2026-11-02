-- kouzelnydeda.cz on Cloudflare D1 (30. 10. 2026). Data come from the WordPress export (scripts/migrate-from-wp.py);
-- offers are created, refreshed and expired by the import Worker (workers/import) straight from the partners' feeds
-- (Slevomat, Adrop, Zážitky.cz), which replaced WP All Import. IDs and slugs are kept from WordPress.

-- Root slug resolver: every /<slug>/ in the site root (offers, categories, posts, pages, blog categories) in one lookup.
CREATE TABLE slugs (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('product','category','post','page','postcat')),
  ref_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- One partner offer = one product (WooCommerce external product on WordPress).
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source TEXT NOT NULL,                     -- slevomat | adrop | zazitky
  ext_id TEXT NOT NULL,                     -- the feed's own id (Slevomat ID, Adrop ITEMGROUP_ID, Zážitky ID)
  store_id INTEGER NOT NULL DEFAULT 0,      -- stores.id (WordPress taxonomy "store", /brand/<slug>/)
  active INTEGER NOT NULL DEFAULT 1,        -- 0 = gone from the feed (page says "skončila", noindex; 301 after 30 days)
  price REAL NOT NULL DEFAULT 0,
  price_old REAL NOT NULL DEFAULT 0,
  disc_pct INTEGER NOT NULL DEFAULT 0,
  target_url TEXT NOT NULL,                 -- final affiliate URL, returned byte for byte by /go/<id>/
  image TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',        -- JSON array of further photos (feed URLs)
  lok_id INTEGER NOT NULL DEFAULT 0,        -- lokality.id (pa_lokalita), 0 = none
  city TEXT NOT NULL DEFAULT '',            -- city as printed by the feed
  excerpt TEXT NOT NULL DEFAULT '',         -- meta description source (WordPress post_excerpt)
  info TEXT NOT NULL DEFAULT '{}',          -- structured feed data for the detail page (see workers/import/src/parse.ts)
  legacy_html TEXT NOT NULL DEFAULT '',     -- WordPress post_content, shown only while info is empty
  cat_ids TEXT NOT NULL DEFAULT '[]',       -- directly assigned categories (kept while expired)
  primary_cat INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  pop INTEGER NOT NULL DEFAULT 0,           -- popularity: clicks of the last 30 days + feed priority/customers
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  seen_at TEXT NOT NULL DEFAULT '',         -- last import that saw the offer
  expired_at TEXT NOT NULL DEFAULT '',
  noindex INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE UNIQUE INDEX idx_products_ext ON products(source, ext_id);
CREATE INDEX idx_products_active ON products(active, created_at DESC);
CREATE INDEX idx_products_lok ON products(lok_id, active, created_at DESC);
CREATE INDEX idx_products_store ON products(store_id, active, created_at DESC);
CREATE INDEX idx_products_pop ON products(active, pop DESC);

-- Category membership of ACTIVE offers flattened to every ancestor (WooCommerce archives include child categories),
-- with the sort keys inside, so a listing page is one index range scan.
CREATE TABLE cat_products (
  cat_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  direct INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  disc INTEGER NOT NULL DEFAULT 0,
  pop INTEGER NOT NULL DEFAULT 0,
  lok_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cat_id, created_at, product_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_cp_product ON cat_products(product_id);
CREATE INDEX idx_cp_price ON cat_products(cat_id, price);
CREATE INDEX idx_cp_pop ON cat_products(cat_id, pop DESC);
CREATE INDEX idx_cp_disc ON cat_products(cat_id, disc DESC);
CREATE INDEX idx_cp_lok ON cat_products(cat_id, lok_id, created_at DESC);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent INTEGER NOT NULL DEFAULT 0,
  description_html TEXT NOT NULL DEFAULT '',
  count_direct INTEGER NOT NULL DEFAULT 0,
  count_total INTEGER NOT NULL DEFAULT 0,
  canon_id INTEGER NOT NULL DEFAULT 0,      -- same-name duplicate → canonical category (kd_dup_canon_map)
  noindex INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  seo_robots TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',           -- tile photo (nightly: photo of the most popular offer)
  created_at TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX idx_categories_parent ON categories(parent);

-- pa_lokalita (/lokalita/<slug>/) and store (/brand/<slug>/)
CREATE TABLE lokality (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE stores (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('post','page')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  cat_id INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  image_card TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  image_w INTEGER NOT NULL DEFAULT 0,
  image_h INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL DEFAULT '',
  noindex INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  seo_robots TEXT NOT NULL DEFAULT '',
  canonical TEXT NOT NULL DEFAULT '',
  offers_cat TEXT NOT NULL DEFAULT '',      -- meta kd_offers_cat (category slug of the offer boxes), '' = from links
  ld_json TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'publish',
  UNIQUE (type, slug)
) STRICT;
CREATE INDEX idx_posts_type_date ON posts(type, status, published_at DESC);

CREATE TABLE post_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0
) STRICT;

-- from_path is decoded + lower-case; to_path is a site path or (Pretty Links, 307) an absolute URL
CREATE TABLE redirects (
  from_path TEXT PRIMARY KEY,
  to_path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 301
) STRICT, WITHOUT ROWID;

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'go',
  ip_hash TEXT NOT NULL DEFAULT '',
  clicked_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_clicks_time ON clicks(clicked_at);
CREATE INDEX idx_clicks_product ON clicks(product_id, clicked_at);

-- precomputed blocks (homepage, combos, sitemaps) and data_version (part of every edge-cache key)
CREATE TABLE site_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- import bookkeeping
CREATE TABLE feed_state (
  feed TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  last_run_at TEXT,
  last_ok_at TEXT,
  last_status TEXT,
  last_message TEXT,
  items INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0
) STRICT, WITHOUT ROWID;
CREATE TABLE import_runs (
  id INTEGER PRIMARY KEY,
  feed TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  expired INTEGER NOT NULL DEFAULT 0,
  revived INTEGER NOT NULL DEFAULT 0,
  message TEXT
) STRICT;

-- offer search (name + city), diacritics-insensitive; rowid = products.id
CREATE VIRTUAL TABLE product_fts USING fts5(name, city, tokenize = 'unicode61 remove_diacritics 2');
