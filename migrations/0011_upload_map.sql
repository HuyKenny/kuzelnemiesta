-- Old WordPress upload paths (stem: no size suffix, no extension) → offer, so /wp-content/uploads/… photos known to Google
-- Images redirect to the offer's current photo instead of 404 (3. 11. 2026).
CREATE TABLE IF NOT EXISTS upload_map (stem TEXT PRIMARY KEY, product_id INTEGER NOT NULL) WITHOUT ROWID;
