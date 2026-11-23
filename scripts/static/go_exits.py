#!/usr/bin/env python3
"""Static affiliate exits (/go/…, kakapo /akce/…) straight from the local SQLite state (logic of the workspace tool
scripts/cloudflare-free/go-z-d1.py, which froze the live sites on 23. 11. 2026).

Mirrors handleGo() of the shop template: https + partner host allow-list, inactive/unsafe -> the offer page,
Slevomat/Zľavomat utm_content=go. site.json "go" picks the shape:
  "products"  /go/<product id>/          (kouzelnydeda, kuzelnemiesta)
  "go_slug"   /go/<offer go_slug>/       (alkoholicky, eroka; legacy go_legacy slugs -> product page)
  "kakapo"    /go/<offer id>/ + /akce/<product id>/
"""
import html
import json
import re
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

ALLOWED = ['slevomat.cz', 'ehub.cz', 'adrop.cz', 'zazitky.cz', 'dognet.com', 'jdoqocy.com', 'anrdoezrs.net', 'kqzyfj.com',
           'tkqlhce.com', 'dpbolvw.net', 'affiliateport.eu', 'radynacestu.cz', 'amazingplaces.cz', 'zlavomat.sk',
           'dognet.sk', 'awin1.com', 'heureka.cz', 'heureka.sk', 'adrop.sk']


def safe(url, extra=()):
    if not isinstance(url, str) or not url or len(url) > 8192 or not re.fullmatch(r"[\x21-\x7e]+", url):
        return False
    u = urlsplit(url)
    if u.scheme != "https" or "@" in u.netloc:
        return False
    host = (u.hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in ALLOWED + list(extra))


def https(url):
    """Sites whose allow-list is extended by a secret env var: enforce only https + header-safe (own data)."""
    return isinstance(url, str) and url.startswith("https://") and bool(re.fullmatch(r"[\x21-\x7e]{1,8192}", url))


def page(target):
    a = html.escape(target, quote=True)
    return ('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">'
            f'<meta http-equiv="refresh" content="0;url={a}"><title>Přesměrování…</title>'
            f'<script>location.replace({json.dumps(target)})</script>'
            f'<a href="{a}" rel="nofollow sponsored">Pokračovat</a>')


def exits(site, con):
    q = lambda sql: [dict(r) for r in con.execute(sql)]
    out, bad = {}, 0
    shape = site.get("go", "products")
    if shape == "kakapo":
        for row in q("SELECT o.id, o.affiliate_url AS u, h.slug AS hs, CASE WHEN o.active = 1 AND h.hidden = 0 "
                     "THEN 1 ELSE 0 END AS ok FROM offers o LEFT JOIN hotels h ON h.id = o.hotel_id"):
            ok = row["ok"] and https(row["u"])
            bad += not ok
            out[f"go/{row['id']}"] = row["u"] if ok else (f"/hotel/{row['hs']}/" if row["hs"] else "/zajezdy/")
        for row in q("SELECT id, affiliate_url AS u, CASE WHEN active = 1 AND hidden = 0 THEN 1 ELSE 0 END AS ok FROM products"):
            ok = row["ok"] and https(row["u"])
            bad += not ok
            if ok:
                out[f"akce/{row['id']}"] = row["u"]
    elif shape == "go_slug":
        for row in q("SELECT o.go_slug, o.target_url, o.active, p.slug AS ps FROM offers o "
                     "LEFT JOIN products p ON p.id = o.product_id WHERE o.go_slug IS NOT NULL"):
            ok = row["active"] and https(row["target_url"])
            bad += not ok
            out["go/" + row["go_slug"]] = row["target_url"] if ok else (f"/{row['ps']}/" if row["ps"] else "/")
        for row in q("SELECT g.slug, p.slug AS ps FROM go_legacy g JOIN products p ON p.id = g.product_id"):
            out.setdefault("go/" + row["slug"], f"/{row['ps']}/")
    else:
        for row in q("SELECT id, slug, source, target_url, active FROM products"):
            t = row["target_url"]
            if not row["active"] or not safe(t, site.get("go_hosts", [])):
                bad += 1
                t = f"/{row['slug']}/"
            elif row["source"] in ("slevomat", "zlavomat"):
                t = re.sub(r"([?&]utm_content=)[^&]*", r"\1go", t)
            out[f"go/{row['id']}"] = t
    return out, bad


def write(site, out_dir, db_path):
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    ex, bad = exits(site, con)
    con.close()
    n = 0
    for key, t in ex.items():
        if not re.fullmatch(r"(go|akce)/[a-z0-9-]{1,200}", key):
            continue
        d = Path(out_dir) / key
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page(t), encoding="utf-8")
        n += 1
    print(f"exits: {n} pages ({bad} inactive/outside the allow-list -> offer page)", flush=True)
    if site.get("redirect_pages"):
        print(f"redirect pages: {redirect_pages(site, out_dir, db_path)}", flush=True)
    return n


def redirect_page(site, target):
    a = html.escape(target, quote=True)
    canon = html.escape("https://" + site["domain"] + target, quote=True)
    return ('<!doctype html><meta charset="utf-8"><title>Přesměrování…</title>'
            f'<link rel="canonical" href="{canon}"><meta http-equiv="refresh" content="0;url={a}">'
            f'<script>location.replace({json.dumps(target)})</script><a href="{a}">Pokračovat</a>')


def redirect_pages(site, out_dir, db_path):
    """Rows of the D1 `redirects` table (kakapo: retired + merged hotels, 301 in the SSR middleware) as instant-refresh pages
    with a canonical to the target, where the crawl wrote no page. Without them the retired hotel URLs would 404."""
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = con.execute("SELECT from_path, to_path FROM redirects").fetchall()
    con.close()
    n = 0
    for frm, to in rows:
        if not re.fullmatch(r"/[a-z0-9-]+(/[a-z0-9-]+)*/", frm or "") or not re.fullmatch(r"/[a-z0-9/-]*", to or "") or frm == to:
            continue
        d = Path(out_dir) / frm.strip("/")
        if (d / "index.html").exists() or (Path(out_dir) / (frm.strip("/") + ".html")).exists():
            continue
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(redirect_page(site, to), encoding="utf-8")
        n += 1
    return n


if __name__ == "__main__":
    import sys
    s = json.loads((Path(__file__).parent / "site.json").read_text())
    write(s, sys.argv[1], sys.argv[2])
