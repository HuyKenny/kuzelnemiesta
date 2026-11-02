#!/usr/bin/env python3
"""Snapshot of the live WordPress <title>/description/robots/canonical/H1/JSON-LD of kuzelnemiesta.sk (30. 10. 2026):
every post, page, product category, city (pa_lokalita) and store archive, the city × category combos, a sample of
products and the top GSC URLs — the reference for the migration and for seo-parity.py.

    live-meta-snapshot.py <export-dir> [--ld] [--products N] [--gsc file.tsv]  → <export-dir>/live-meta.json (resumable)

Through Cloudflare (the "Cache Everything" rule answers fast; the WEDOS origin renders a page in ~12 s) with the
MalinaCron UA (a browser UA from Malina gets a managed challenge).
"""
import html
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import random

UA = "MalinaCron/1.0 (kuzelnemiesta migrace)"


def get(path):
    for attempt in range(4):
        r = subprocess.run(["curl", "-s", "-4", "-m", "90", "-A", UA, "-w", "\n%{http_code}|%{redirect_url}", f"https://kuzelnemiesta.sk{path}"], capture_output=True)
        body, _, tail = r.stdout.rpartition(b"\n")
        code, _, loc = tail.decode().partition("|")
        if code.strip().isdigit() and int(code) < 500:
            if 300 <= int(code) < 400:
                return int(code), loc.replace("https://kuzelnemiesta.sk", "")
            return int(code), body.decode("utf-8", "replace")
        time.sleep(5 * (attempt + 1))
    return 0, ""


def meta(t):
    def m(rx):
        x = re.search(rx, t, re.S)
        return html.unescape(x.group(1)).strip() if x else ""
    return {
        "title": m(r"<title>(.*?)</title>"),
        "desc": m(r'<meta name="description" content="([^"]*)"'),
        "robots": m(r'<meta name="robots" content="([^"]*)"'),
        "canonical": m(r'<link rel="canonical" href="([^"]*)"'),
        "h1": re.sub(r"<[^>]+>", "", m(r"<h1[^>]*>(.*?)</h1>")).strip(),
        # every JSON-LD block as printed (posts/pages re-emit theirs: FAQPage, Recipe, WebApplication … from mu-plugins)
        "ld": [x for x in (_json(s) for s in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', t, re.S)) if x is not None],
    }


def _json(s):
    try:
        return json.loads(s)
    except ValueError:
        return None


def main():
    exp = Path(sys.argv[1])
    out = exp / "live-meta.json"
    snap = json.load(open(out)) if out.exists() else {}
    arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    paths = ["/", "/blog/", "/blog/page/2/"]
    for sm in ("post-sitemap.xml", "page-sitemap.xml", "category-sitemap.xml", "product_cat-sitemap1.xml", "product_cat-sitemap2.xml",
               "pa_lokalita-sitemap.xml", "store-sitemap.xml"):
        _, x = get("/" + sm)
        paths += [u.replace("https://kuzelnemiesta.sk", "") for u in re.findall(r"<loc>(https://kuzelnemiesta\.sk/[^<]*)</loc>", x)]
    cats, cities = [], []
    for line in open(exp / "terms.ndjson"):
        t = json.loads(line)
        if t["taxonomy"] == "product_cat":
            paths.append(f"/{t['slug']}/")
            if int(t["count"]) >= 40:
                cats.append(t["slug"])
        elif t["taxonomy"] == "pa_lokalita":
            paths.append(f"/lokalita/{t['slug']}/")
    # combos of the biggest categories with the mapped cities (kd_city_map) + page 2 of big listings
    for c in cats[:40]:
        for city in ("praha", "brno", "ostrava", "plzen", "olomouc", "liberec"):
            paths.append(f"/{c}/lokalita/{city}/")
        paths.append(f"/{c}/page/2/")
    prods = [json.loads(l)["slug"] for l in open(exp / "products.ndjson")]
    random.seed(30)
    paths += [f"/{s}/" for s in random.sample(prods, min(len(prods), int(arg("--products", 400))))]
    gsc = arg("--gsc", "")
    if gsc:
        rows = [l.rstrip("\n").split("\t") for l in open(gsc) if l.startswith("http")]
        rows.sort(key=lambda r: -float(r[1]))
        paths += [r[0].replace("https://kuzelnemiesta.sk", "") for r in rows[:300]]
    paths = list(dict.fromkeys(paths))
    print(len(paths), "urls", flush=True)
    for i, p in enumerate(paths):
        if p in snap and ("ld" in snap[p] or snap[p].get("status") != 200 or "--ld" not in sys.argv):
            continue
        code, t = get(p)
        snap[p] = {"status": code, **(meta(t) if code == 200 else {"location": t} if 300 <= code < 400 else {})}
        if i % 20 == 0:
            json.dump(snap, open(out, "w"), ensure_ascii=False, indent=0)
            print(i, p, code, flush=True)
        time.sleep(0.3)
    json.dump(snap, open(out, "w"), ensure_ascii=False, indent=0)
    print("done", len(snap))


if __name__ == "__main__":
    main()
