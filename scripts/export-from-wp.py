#!/usr/bin/env python3
"""kouzelnydeda.cz — WordPress export for the Astro migration (30. 10. 2026). Read-only.

    python3 scripts/export-from-wp.py <out-dir> [--rest]   # --rest: only the REST part (article HTML)

DB via the one-off PHP helper of scripts/kouzelnydeda/wp-db.py (uploaded, used, deleted), article HTML via the REST
API (content.rendered = wpautop + shortcodes, like the live page). Writes NDJSON/JSON files that
scripts/migrate-from-wp.py turns into D1 SQL.
"""
import base64
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

AI = Path("/home/kenny/ai")
spec = importlib.util.spec_from_file_location("wpdb", AI / "scripts/kouzelnydeda/wp-db.py")
wpdb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wpdb)

UA = "MalinaCron/1.0 (kouzelnydeda migrace)"

Q = {
    # catalogue
    "products": "SELECT ID AS id, post_name AS slug, post_title AS name, post_content AS content, post_excerpt AS excerpt, "
                "post_date AS created_at, post_modified AS updated_at, post_status AS status FROM {P}posts "
                "WHERE post_type='product' AND post_status='publish' ORDER BY ID",
    "product_meta": "SELECT m.post_id AS id, m.meta_key AS k, m.meta_value AS v FROM {P}postmeta m JOIN {P}posts p ON p.ID=m.post_id "
                    "WHERE p.post_type='product' AND p.post_status='publish' AND m.meta_key IN "
                    "('_sku','_product_url','_regular_price','_sale_price','_price','_thumbnail_id','total_sales','_button_text',"
                    "'rank_math_title','rank_math_description','rank_math_robots','rank_math_focus_keyword','rank_math_canonical_url') ORDER BY m.meta_id",
    "product_thumbs": "SELECT p.ID AS id, a.meta_value AS file FROM {P}posts p JOIN {P}postmeta t ON t.post_id=p.ID AND t.meta_key='_thumbnail_id' "
                      "JOIN {P}postmeta a ON a.post_id=t.meta_value AND a.meta_key='_wp_attached_file' WHERE p.post_type='product' AND p.post_status='publish'",
    "pmxi_posts": "SELECT post_id, import_id, unique_key, product_key FROM {P}pmxi_posts ORDER BY id",
    "terms": "SELECT t.term_id AS id, t.name, t.slug, tt.taxonomy, tt.parent, tt.description, tt.count FROM {P}terms t "
             "JOIN {P}term_taxonomy tt ON tt.term_id=t.term_id WHERE tt.taxonomy IN ('product_cat','store','pa_lokalita','product_tag','category','post_tag','dealstore') ORDER BY t.term_id",
    "term_rel": "SELECT tr.object_id AS id, tt.term_id, tt.taxonomy FROM {P}term_relationships tr JOIN {P}term_taxonomy tt ON tt.term_taxonomy_id=tr.term_taxonomy_id "
                "WHERE tt.taxonomy IN ('product_cat','store','pa_lokalita','category','post_tag')",
    "termmeta": "SELECT term_id, meta_key, meta_value FROM {P}termmeta WHERE meta_key LIKE 'rank\\_math\\_%' OR meta_key IN ('thumbnail_id','order','display_type') ORDER BY meta_id",
    "term_thumbs": "SELECT m.term_id, a.meta_value AS file FROM {P}termmeta m JOIN {P}postmeta a ON a.post_id=m.meta_value AND a.meta_key='_wp_attached_file' WHERE m.meta_key='thumbnail_id'",
    # editorial
    "posts": "SELECT ID AS id, post_type AS type, post_name AS slug, post_title AS title, post_excerpt AS excerpt, post_date AS published_at, "
             "post_modified AS modified_at, post_status AS status, post_author AS author_id, post_parent AS parent FROM {P}posts "
             "WHERE post_type IN ('post','page') AND post_status IN ('publish','draft','private') ORDER BY ID",
    "post_meta": "SELECT m.post_id AS id, m.meta_key AS k, m.meta_value AS v FROM {P}postmeta m JOIN {P}posts p ON p.ID=m.post_id "
                 "WHERE p.post_type IN ('post','page') AND (m.meta_key LIKE 'rank\\_math\\_%' OR m.meta_key IN ('_thumbnail_id','kd_offers_cat','_wp_page_template')) "
                 "AND m.meta_key NOT IN ('rank_math_internal_links_processed','rank_math_analytic_object_id','rank_math_seo_score','rank_math_contentai_score') ORDER BY m.meta_id",
    "post_thumbs": "SELECT p.ID AS id, a.meta_value AS file, am.meta_value AS meta, alt.meta_value AS alt FROM {P}posts p "
                   "JOIN {P}postmeta t ON t.post_id=p.ID AND t.meta_key='_thumbnail_id' "
                   "JOIN {P}postmeta a ON a.post_id=t.meta_value AND a.meta_key='_wp_attached_file' "
                   "LEFT JOIN {P}postmeta am ON am.post_id=t.meta_value AND am.meta_key='_wp_attachment_metadata' "
                   "LEFT JOIN {P}postmeta alt ON alt.post_id=t.meta_value AND alt.meta_key='_wp_attachment_image_alt' "
                   "WHERE p.post_type IN ('post','page')",
    "authors": "SELECT ID AS id, display_name AS name FROM {P}users",
    "comments": "SELECT comment_ID AS id, comment_post_ID AS post_id, comment_author AS author, comment_date AS created_at, comment_content AS content "
                "FROM {P}comments WHERE comment_approved='1' AND comment_type IN ('','comment','review') ORDER BY comment_ID",
    # SEO plumbing
    "old_slugs": "SELECT m.post_id, m.meta_value AS old_slug, p.post_name AS slug, p.post_type FROM {P}postmeta m JOIN {P}posts p ON p.ID=m.post_id "
                 "WHERE m.meta_key='_wp_old_slug' AND p.post_status='publish' ORDER BY m.meta_id",
    "redirections": "SELECT * FROM {P}rank_math_redirections ORDER BY id",
    "prli_links": "SELECT id, url, slug, redirect_type, link_status FROM {P}prli_links ORDER BY id",
    "options": "SELECT option_name, option_value FROM {P}options WHERE option_name LIKE 'rank-math-options%' OR option_name IN "
               "('blogname','blogdescription','page_on_front','page_for_posts','show_on_front','permalink_structure','woocommerce_permalinks',"
               "'category_base','tag_base','posts_per_page','woocommerce_catalog_rows','woocommerce_catalog_columns','rank_math_modules') ORDER BY option_id",
}


def rest(path):
    c = {}
    for line in open(AI / "credentials/.kouzelnydeda-credentials.env"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            c[k] = v.strip().strip("\"'")
    for attempt in range(5):
        r = subprocess.run(["curl", "-s", "-4", "-A", UA, "-u", f"{c['WP_USER']}:{c['WP_APP_PASSWORD']}", "-D", "-", f"https://kouzelnydeda.cz/wp-json/{path}"],
                           capture_output=True)
        head, _, body = r.stdout.partition(b"\r\n\r\n")
        while body.startswith(b"HTTP/"):
            head, _, body = body.partition(b"\r\n\r\n")
        if b" 200" in head.split(b"\r\n")[0]:
            i = body.find(b"[")
            j = body.find(b"{")
            start = min(x for x in (i, j) if x >= 0)
            total = 0
            for h in head.split(b"\r\n"):
                if h.lower().startswith(b"x-wp-totalpages:"):
                    total = int(h.split(b":")[1])
            return json.loads(body[start:]), total
        time.sleep(3 * (attempt + 1))
    sys.exit(f"REST failed: {path} {r.stdout[:200]!r}")


def main(out, only_rest=False):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    if not only_rest:
        db_part(out)
    rest_part(out)


def db_part(out):
    with wpdb.Remote() as r:
        for name, sql in Q.items():
            n = 0
            with open(out / f"{name}.ndjson", "w", encoding="utf-8") as f:
                step = 1500 if name in ("products", "posts") else 20000
                for row in r.query(sql, step=step):
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    n += 1
            print(f"{name}: {n}", flush=True)
    # the helper refuses bodies starting with "<" (PHP source) → plain FTP
    import io
    f, buf = wpdb.ftp(), io.BytesIO()
    f.retrbinary(f"RETR {wpdb.ROOT}/wp-content/mu-plugins/kd-redirects.php", buf.write)
    f.quit()
    (out / "kd-redirects.php").write_bytes(buf.getvalue())
    print("kd-redirects.php ok")


def rest_part(out):
    # article/page HTML as the live site renders it (content.rendered), raw for shortcode positions
    rendered = {}
    for typ in ("posts", "pages"):
        page = 1
        while True:
            data, pages = rest(f"wp/v2/{typ}?per_page=50&page={page}&status=publish&context=edit&_fields=id,content,excerpt")
            for p in data:
                rendered[p["id"]] = {"html": p["content"]["rendered"], "raw": p["content"]["raw"], "excerpt": p["excerpt"]["rendered"]}
            if page >= pages:
                break
            page += 1
    (out / "post_html.json").write_text(json.dumps(rendered, ensure_ascii=False))
    print("post_html:", len(rendered))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], only_rest="--rest" in sys.argv)
