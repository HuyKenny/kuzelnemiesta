-- Ranking: components of the "most likely to convert" score (0..1, raw), the per-category score, list views and
-- the Search Console impressions of a product page.
ALTER TABLE products ADD COLUMN search_impr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN conv_30d INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN r_sales REAL NOT NULL DEFAULT 0.5;
ALTER TABLE products ADD COLUMN r_click REAL NOT NULL DEFAULT 0.5;
ALTER TABLE products ADD COLUMN r_search REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN r_qual REAL NOT NULL DEFAULT 0.5;
ALTER TABLE products ADD COLUMN r_new REAL NOT NULL DEFAULT 0.5;
ALTER TABLE products ADD COLUMN rank_score REAL NOT NULL DEFAULT 0;
ALTER TABLE cat_products ADD COLUMN rank REAL NOT NULL DEFAULT 0;
-- how many times a listing page (/<category>/, /<category>/page/N/) was shown per day (humans only, counted in the middleware)
CREATE TABLE IF NOT EXISTS list_views (day TEXT NOT NULL, slug TEXT NOT NULL, page INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, slug, page));
-- impressions of a product in a category per day, derived at finalize from list_views × the order at that time
CREATE TABLE IF NOT EXISTS impr_daily (day TEXT NOT NULL, cat_id INTEGER NOT NULL, product_id INTEGER NOT NULL, pos INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, cat_id, product_id));
CREATE INDEX IF NOT EXISTS idx_impr_product ON impr_daily (product_id, day);
CREATE INDEX IF NOT EXISTS idx_cat_products_rank ON cat_products (cat_id, rank DESC);
