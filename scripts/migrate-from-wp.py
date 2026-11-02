#!/usr/bin/env python3
"""kouzelnydeda.cz — WordPress export → SQL for D1 (30. 10. 2026, structure from the alkoholicky migration).

    migrate-from-wp.py <export-dir> <out-dir>

Reads the export of scripts/export-from-wp.py (+ live-meta.json of scripts/live-meta-snapshot.py), writes SQL chunks
(<out-dir>/NNN-<table>.sql, each < ~3.5 MB, statements < 90 kB) plus _report.json and uploads.txt (article files to copy).

Rules (kept 1:1 with the live site):
  * ids and slugs from WordPress; offers keep their WP id, the feed key comes from WP All Import (pmxi_posts / _sku)
  * category tree, SEO descriptions and Rank Math overrides from the DB; titles/descriptions/robots of posts and pages
    from the live snapshot (what Google knows)
  * redirects: Rank Math redirections (exact), _wp_old_slug, the kd-redirects.php map, Pretty Links (307 to the partner)
"""
import gzip
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

MAX_STMT = 90_000
MAX_FILE = 3_500_000
BASE = "https://kouzelnydeda.cz"
# WP All Import import id → feed source
IMPORT_SOURCE = {"25": "slevomat", "26": "slevomat", "27": "adrop", "28": "zazitky"}
STORE_SOURCE = {"slevomat-cz": "slevomat", "adrop-cz": "adrop", "zazitky-cz": "zazitky"}
# kd_city_map(): slug → (nominative, locative)
CITY = {
    "cr": ("Česko", "v Česku"), "praha": ("Praha", "v Praze"), "brno": ("Brno", "v Brně"), "ostrava": ("Ostrava", "v Ostravě"),
    "plzen": ("Plzeň", "v Plzni"), "ceske-budejovice": ("České Budějovice", "v Českých Budějovicích"),
    "usti-nad-labem": ("Ústí nad Labem", "v Ústí nad Labem"), "hradec-kralove": ("Hradec Králové", "v Hradci Králové"),
    "olomouc": ("Olomouc", "v Olomouci"), "liberec": ("Liberec", "v Liberci"), "pardubice": ("Pardubice", "v Pardubicích"),
    "zlin": ("Zlín", "ve Zlíně"), "karlovy-vary": ("Karlovy Vary", "v Karlových Varech"), "jihlava": ("Jihlava", "v Jihlavě"),
}


def nd(path):
    p = Path(path)
    if not p.exists():
        return []
    op = gzip.open if p.suffix == ".gz" else open
    with op(p, "rt", encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v) if isinstance(v, float) else str(v)
    s = str(v).replace("\x00", "")
    return "'" + s.replace("'", "''") + "'"


class Writer:
    def __init__(self, out):
        self.out = Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        for f in self.out.glob("*.sql"):
            f.unlink()
        self.n = 0
        self.buf = []
        self.size = 0
        self.name = ""

    def flush(self):
        if self.buf:
            self.n += 1
            (self.out / f"{self.n:03d}-{self.name}.sql").write_text("".join(self.buf), encoding="utf-8")
            self.buf, self.size = [], 0

    def table(self, name, cols, rows):
        self.flush()
        self.name = name
        head = f"INSERT INTO {name} ({', '.join(cols)}) VALUES "
        cur, cur_len = [], len(head)
        for r in rows:
            t = "(" + ", ".join(q(v) for v in r) + ")"
            tl = len(t.encode("utf-8"))  # D1 limits statements in bytes (100 kB), Czech text is 2 bytes/char
            if cur and cur_len + tl + 2 > MAX_STMT:
                self._stmt(head, cur)
                cur, cur_len = [], len(head)
            cur.append(t)
            cur_len += tl + 2
        if cur:
            self._stmt(head, cur)
        self.flush()

    def raw(self, name, sql):
        self.flush()
        self.name = name
        self.buf.append(sql if sql.endswith("\n") else sql + "\n")
        self.flush()

    def _stmt(self, head, cur):
        s = head + ",\n".join(cur) + ";\n"
        sl = len(s.encode("utf-8"))
        if self.size + sl > MAX_FILE:
            self.flush()
        self.buf.append(s)
        self.size += sl


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def num(v):
    try:
        return float(str(v).replace(",", ".").replace(" ", "")) if str(v).strip() not in ("", "None") else 0.0
    except ValueError:
        return 0.0


def rm_robots(v):
    # serialized PHP array, e.g. a:1:{i:0;s:7:"noindex";}
    return ",".join(re.findall(r's:\d+:"([a-z-]+)"', v or ""))


def emoji_back(h):
    """wp_staticize_emoji turned emoji into <img class="emoji" alt="🎁" src="https://s.w.org/…"> — back to text."""
    return re.sub(r'<img[^>]*class="(?:wp-smiley|emoji)"[^>]*alt="([^"]*)"[^>]*/?>', r"\1", h)


def own(u):
    return re.sub(r"^https?://(?:www\.)?kouzelnydeda\.cz(?=/)", "", u or "")


def main():
    exp, out = Path(sys.argv[1]), sys.argv[2]
    W = Writer(out)
    rep = defaultdict(int)
    live = json.load(open(exp / "live-meta.json")) if (exp / "live-meta.json").exists() else {}

    def live_meta(path):
        m = live.get(path) or {}
        return m if m.get("status") == 200 else {}

    # ---------- terms ----------
    terms = {int(t["id"]): t for t in nd(exp / "terms.ndjson")}
    tmeta = defaultdict(dict)
    for r in nd(exp / "termmeta.ndjson"):
        tmeta[int(r["term_id"])][r["meta_key"]] = r["meta_value"]
    cats = {i: t for i, t in terms.items() if t["taxonomy"] == "product_cat"}
    for c in cats.values():
        c["parent"] = int(c["parent"] or 0)

    def ancestors(cid):
        out_, seen = [], set()
        while cid and cid in cats and cid not in seen:
            out_.append(cid)
            seen.add(cid)
            cid = cats[cid]["parent"]
        return out_

    def depth(cid):
        return len(ancestors(cid))

    # kd_dup_canon_map: same name → the one with most products, then with a description, then the lowest id
    groups = defaultdict(list)
    for c in cats.values():
        groups[c["name"].strip().lower()].append(c)
    canon = {}
    for g in groups.values():
        if len(g) < 2:
            continue
        g.sort(key=lambda t: (-int(t["count"]), 0 if (t["description"] or "").strip() else 1, int(t["id"])))
        for d in g[1:]:
            canon[int(d["id"])] = int(g[0]["id"])
    rep["dup_categories"] = len(canon)

    # ---------- products ----------
    pmeta = defaultdict(dict)
    for r in nd(exp / "product_meta.ndjson"):
        pmeta[int(r["id"])][r["k"]] = r["v"]
    pmxi = {int(r["post_id"]): r for r in nd(exp / "pmxi_posts.ndjson")}
    thumbs = {int(r["id"]): r["file"] for r in nd(exp / "product_thumbs.ndjson")}
    rel = defaultdict(lambda: defaultdict(list))
    for r in nd(exp / "term_rel.ndjson"):
        rel[int(r["id"])][r["taxonomy"]].append(int(r["term_id"]))

    lok_slug = {i: t["slug"] for i, t in terms.items() if t["taxonomy"] == "pa_lokalita"}
    store_by_id = {i: t for i, t in terms.items() if t["taxonomy"] == "store"}
    products, prow, cp_rows, fts = [], {}, [], []
    direct_count, total_members = defaultdict(int), defaultdict(set)
    ext_seen = set()
    for p in nd(exp / "products.ndjson"):
        pid = int(p["id"])
        m = pmeta[pid]
        imp = pmxi.get(pid)
        st = [s for s in rel[pid]["store"] if s in store_by_id]
        store_id = st[0] if st else 0
        source = IMPORT_SOURCE.get(str(imp["import_id"])) if imp else None
        if not source and store_id:
            source = STORE_SOURCE.get(store_by_id[store_id]["slug"])
        if not source:
            rep["product_without_source"] += 1
            source = "slevomat"
        ext = (imp["unique_key"] if imp and str(imp["import_id"]) == "27" else m.get("_sku")) or (imp or {}).get("unique_key") or f"wp{pid}"
        if (source, ext) in ext_seen:
            rep["product_dup_ext"] += 1
            ext = f"{ext}#wp{pid}"
        ext_seen.add((source, ext))
        reg, sale = num(m.get("_regular_price")), num(m.get("_sale_price"))
        price = sale if 0 < sale < reg else (reg or num(m.get("_price")))
        old = reg if 0 < sale < reg else 0.0
        disc = round((old - price) / old * 100) if old > 0 and price < old else 0
        cids = [c for c in rel[pid]["product_cat"] if c in cats]
        primary = max(cids, key=lambda c: (depth(c), -int(cats[c]["count"]), -c)) if cids else 0
        loks = [l for l in rel[pid]["pa_lokalita"] if l in lok_slug]
        lok = loks[0] if loks else 0
        city = CITY.get(lok_slug.get(lok, ""), (lok_slug.get(lok, "").replace("-", " ").title(),))[0] if lok else ""
        robots = rm_robots(m.get("rank_math_robots"))
        image = f"{BASE}/wp-content/uploads/{thumbs[pid]}" if pid in thumbs else ""
        row = dict(id=pid, slug=p["slug"], name=html.unescape(p["name"]), source=source, ext_id=ext, store_id=store_id, active=1,
                   price=price, price_old=old, disc_pct=disc, target_url=(m.get("_product_url") or "").replace("&amp;", "&"),
                   image=image, images="[]", lok_id=lok, city=city, excerpt=p["excerpt"] or "", info="{}",
                   legacy_html=emoji_back(p["content"] or ""), cat_ids=json.dumps(cids), primary_cat=primary,
                   rating=0.0, reviews=0, pop=int(num(m.get("total_sales"))), created_at=p["created_at"], updated_at=p["updated_at"],
                   seen_at="", expired_at="", noindex=1 if "noindex" in robots else 0,
                   seo_title=m.get("rank_math_title") or "", seo_desc=m.get("rank_math_description") or "", content_hash="")
        products.append(row)
        prow[pid] = row
        members = set()
        for c in cids:
            members.update(ancestors(c))
            direct_count[c] += 1
        for c in members:
            total_members[c].add(pid)
            cp_rows.append((c, p["created_at"], pid, 1 if c in cids else 0, price, disc, row["pop"], lok))
        fts.append((pid, row["name"], city))
    rep["products"] = len(products)

    # ---------- categories ----------
    cat_rows = []
    for cid, c in sorted(cats.items()):
        tm = tmeta[cid]
        robots = rm_robots(tm.get("rank_math_robots"))
        noindex = 1 if ("noindex" in robots or c["slug"] == "nezarazene") else 0
        cat_rows.append((cid, c["slug"], html.unescape(c["name"]), c["parent"], c["description"] or "", direct_count[cid], len(total_members[cid]),
                         canon.get(cid, 0), noindex, tm.get("rank_math_title") or "", tm.get("rank_math_description") or "", robots, ""))
    W.table("categories", ["id", "slug", "name", "parent", "description_html", "count_direct", "count_total", "canon_id", "noindex",
                           "seo_title", "seo_desc", "seo_robots", "image"], cat_rows)
    rep["categories"] = len(cat_rows)

    lok_count = defaultdict(int)
    store_count = defaultdict(int)
    for r in products:
        lok_count[r["lok_id"]] += 1
        store_count[r["store_id"]] += 1
    W.table("lokality", ["id", "slug", "name", "count"],
            [(i, s, CITY.get(s, (s.replace("-", " ").title(),))[0], lok_count[i]) for i, s in sorted(lok_slug.items())])
    W.table("stores", ["id", "slug", "name", "description_html", "count"],
            [(i, t["slug"], html.unescape(t["name"]), t["description"] or "", store_count[i]) for i, t in sorted(store_by_id.items())])

    cols = list(products[0].keys())
    W.table("products", cols, [tuple(r[c] for c in cols) for r in products])
    W.table("cat_products", ["cat_id", "created_at", "product_id", "direct", "price", "disc", "pop", "lok_id"], cp_rows)
    W.table("product_fts", ["rowid", "name", "city"], fts)

    # ---------- posts & pages ----------
    posts = nd(exp / "posts.ndjson")
    phtml = json.load(open(exp / "post_html.json"))
    postmeta = defaultdict(dict)
    for r in nd(exp / "post_meta.ndjson"):
        postmeta[int(r["id"])][r["k"]] = r["v"]
    pthumb = {int(r["id"]): r for r in nd(exp / "post_thumbs.ndjson")}
    authors = {int(a["id"]): a["name"] for a in nd(exp / "authors.ndjson")}
    pcat = defaultdict(list)
    for pid, tx in rel.items():
        for t in tx.get("category", []):
            pcat[pid].append(t)
    uploads = set()
    post_rows = []
    blog_id, front_id = 235, 3093
    for p in posts:
        pid = int(p["id"])
        if p["status"] != "publish" or pid == front_id:
            continue
        h = phtml.get(str(pid)) or {}
        content = emoji_back(h.get("html", ""))
        for u in re.findall(r'(?:https?://(?:www\.)?kouzelnydeda\.cz)?(/wp-content/uploads/[^"\'\s)>,]+)', content):
            uploads.add(u)
        content = re.sub(r'https?://(?:www\.)?kouzelnydeda\.cz(?=/wp-content/)', "", content)
        pm = postmeta[pid]
        path = "/blog/" if pid == blog_id else f"/{p['slug']}/"
        lm = live_meta(path)
        robots = lm.get("robots") or rm_robots(pm.get("rank_math_robots"))
        noindex = 1 if "noindex" in robots else 0
        img = img_card = alt = ""
        w = hgt = 0
        if pid in pthumb:
            t = pthumb[pid]
            img = f"/wp-content/uploads/{t['file']}"
            alt = t.get("alt") or ""
            uploads.add(img)
            meta = t.get("meta") or ""
            mw = re.search(r's:5:"width";i:(\d+);s:6:"height";i:(\d+);', meta)
            if mw:
                w, hgt = int(mw.group(1)), int(mw.group(2))
            ml = re.search(r's:12:"medium_large";a:\d+:\{s:4:"file";s:\d+:"([^"]+)"', meta)
            if ml:
                img_card = str(Path(img).parent / ml.group(1))
                uploads.add(img_card)
        cats_ = pcat.get(pid) or [0]
        excerpt = strip_tags(h.get("excerpt", "")) or strip_tags(p["excerpt"])
        ld = ""
        if lm.get("ld"):
            graph = []
            for block in lm["ld"]:
                if isinstance(block, dict) and "@graph" in block:
                    graph += [n for n in block["@graph"] if isinstance(n, dict) and n.get("@type") not in ("Organization", "WebSite")]
            ld = json.dumps({"graph": graph}, ensure_ascii=False) if graph else ""
        post_rows.append((pid, p["type"], "blog" if pid == blog_id else p["slug"], html.unescape(p["title"]), content, excerpt,
                          p["published_at"], p["modified_at"], cats_[0], img, img_card, alt, w, hgt, authors.get(int(p["author_id"] or 0), "Kouzelný děda"),
                          noindex, lm.get("title") or pm.get("rank_math_title") or "", lm.get("desc") or pm.get("rank_math_description") or "",
                          robots, pm.get("rank_math_canonical_url") or "", pm.get("kd_offers_cat") or "", ld, "publish"))
    W.table("posts", ["id", "type", "slug", "title", "content_html", "excerpt", "published_at", "modified_at", "cat_id", "image", "image_card",
                      "image_alt", "image_w", "image_h", "author", "noindex", "seo_title", "seo_desc", "seo_robots", "canonical", "offers_cat",
                      "ld_json", "status"], post_rows)
    rep["posts_pages"] = len(post_rows)
    pc_count = defaultdict(int)
    for r in post_rows:
        if r[1] == "post":
            pc_count[r[8]] += 1
    W.table("post_categories", ["id", "slug", "name", "description", "count"],
            [(i, t["slug"], html.unescape(t["name"]), t["description"] or "", pc_count[i]) for i, t in sorted(terms.items()) if t["taxonomy"] == "category"])
    (Path(out) / "uploads.txt").write_text("\n".join(sorted(uploads)) + "\n")

    # ---------- slugs (no collisions on 30. 10. 2026; product wins like on WordPress) ----------
    slugs = {}
    for r in post_rows:
        if r[2] != "blog":
            slugs[r[2]] = ("post" if r[1] == "post" else "page", r[0])
    slugs["blog"] = ("page", blog_id)
    for tid, t in terms.items():
        if t["taxonomy"] == "category":
            slugs[t["slug"]] = ("postcat", tid)
    for cid, c in cats.items():
        slugs[c["slug"]] = ("category", cid)
    for r in products:
        if r["slug"] in slugs and slugs[r["slug"]][0] != "product":
            rep["slug_collision"] += 1
        slugs[r["slug"]] = ("product", r["id"])
    W.table("slugs", ["slug", "kind", "ref_id"], [(s, k, i) for s, (k, i) in sorted(slugs.items())])

    # ---------- redirects ----------
    red = {}

    def add(frm, to, status=301, why=""):
        f = "/" + frm.strip("/").lower() + "/" if not re.search(r"\.[a-z0-9]{2,5}$", frm) else "/" + frm.strip("/").lower()
        if f == "/" or f in red:
            return
        if f.strip("/") in slugs:  # a live page wins (kd-redirects.php only acted on 404)
            rep["redirect_" + why + "_live_skipped"] += 1
            return
        to = to if to.startswith("http") and status == 307 else own(to) or "/"
        if not to.startswith(("/", "http")):
            to = "/" + to
        red[f] = (to, status)
        rep["redirect_" + why] += 1

    for r in nd(exp / "redirections.ndjson"):
        if r["status"] != "active":
            continue
        for pat, cmp_ in re.findall(r's:7:"pattern";s:\d+:"([^"]*)";s:10:"comparison";s:\d+:"([^"]*)"', r["sources"]):
            if cmp_ == "exact" and not pat.startswith("http"):
                add(pat, r["url_to"], int(r["header_code"]) if r["header_code"] in ("301", "302", "307", "410") else 301, "rankmath")
            else:
                rep["redirect_rankmath_skipped"] += 1
    for frm, to in re.findall(r"""["'](/[^"']*)["']\s*=>\s*["']([^"']*)["']""", (exp / "kd-redirects.php").read_text()):
        add(frm, to, 301, "kdmap")
    for r in nd(exp / "old_slugs.ndjson"):
        if r["old_slug"] and r["old_slug"] != r["slug"]:
            add(r["old_slug"], f"/{r['slug']}/", 301, "oldslug")
    for r in nd(exp / "prli_links.ndjson"):
        if r["link_status"] == "enabled":
            add(r["slug"], r["url"], 307, "prettylink")
    W.table("redirects", ["from_path", "to_path", "status"], [(f, t, s) for f, (t, s) in sorted(red.items())])

    # category × city counts (the import Worker refreshes them nightly)
    combos = defaultdict(lambda: defaultdict(int))
    for c, _, _pid, _d, _pr, _di, _po, lok in cp_rows:
        if lok:
            combos[c][lok_slug[lok]] += 1
    W.raw("site_cache", "INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', '1', datetime('now'));\n"
          f"INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('combos', {q(json.dumps(combos))}, datetime('now'));")
    (Path(out) / "_report.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    print(json.dumps(rep, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main()
