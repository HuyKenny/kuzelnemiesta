-- 30. 10. 2026: partners are mixed in the default order (round robin by rank inside each partner, damped by √size),
-- new partner SkvěléČesko.cz (Dognet). `mix` is recomputed nightly by finalizeDay(); new rows sit in the middle until then.
ALTER TABLE cat_products ADD COLUMN mix INTEGER NOT NULL DEFAULT 500000;
CREATE INDEX idx_cp_mix ON cat_products(cat_id, mix DESC);
ALTER TABLE products ADD COLUMN mix INTEGER NOT NULL DEFAULT 500000;
CREATE INDEX idx_products_mix ON products(active, mix DESC);
INSERT OR IGNORE INTO stores (id, slug, name) VALUES (900001, 'skvele-cesko', 'SkvěléČesko.cz');
