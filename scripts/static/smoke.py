#!/usr/bin/env python3
"""Smoke test of the live static site after a deploy (also usable by hand: python3 scripts/static/smoke.py <domain> [paths…]).

Checks: home + listed pages 200, robots.txt, sitemap index -> number of URLs, every same-origin CSS/JS/font/image of the checked
pages 200 (logic of ~/ai/bin/web-assets-check.py), a sample of sitemap pages 200 and of /go/ exits (a static redirect page).
The zone WAF challenges datacenter IPs (GitHub runners): a 403 with `cf-mitigated: challenge` is "not checked", not a failure.
Exit 1 only on real failures (404/5xx, missing assets).
"""
import html
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Accept-Encoding': 'identity'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def get(u):
    try:
        with OPENER.open(urllib.request.Request(u, headers=UA), timeout=30) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, b'', e.headers
    except Exception as e:  # noqa: BLE001
        return str(e)[:40], b'', {}


def challenged(st, hdr):
    return st == 403 and (hdr.get('cf-mitigated') == 'challenge' if hdr else False)


def main(argv):
    domain, paths = argv[0], argv[1:]
    base = f'https://{domain}'
    bad, skipped, ok = [], 0, 0

    def check(path, want=(200,)):
        nonlocal skipped, ok
        st, body, hdr = get(base + path)
        if challenged(st, hdr):
            skipped += 1
            return None
        if st not in want:
            bad.append(f'{st} {path}')
            return None
        ok += 1
        return body

    pages = {}
    for p in ['/'] + paths:
        b = check(p)
        if b is not None:
            pages[p] = b
    check('/robots.txt')
    # sitemap
    urls, seen, q = [], set(), []
    st, rob, hdr = get(base + '/robots.txt')
    q = re.findall(r'(?im)^sitemap:\s*(\S+)', rob.decode('utf-8', 'replace')) or [base + '/sitemap_index.xml']
    while q:
        u = q.pop()
        if u in seen or len(seen) > 400:
            continue
        seen.add(u)
        st, x, hdr = get(u)
        if challenged(st, hdr):
            skipped += 1
            continue
        if st != 200:
            bad.append(f'{st} sitemap {u}')
            continue
        x = x.decode('utf-8', 'replace')
        locs = [html.unescape(l) for l in re.findall(r'<loc>\s*([^<\s]+)', x)]
        if '<sitemapindex' in x:
            q += locs
        else:
            urls += locs
    print(f'sitemaps: {len(seen)}, URLs: {len(urls)}')
    rnd = random.Random()
    for u in rnd.sample(urls, min(12, len(urls))):
        p = urllib.parse.urlsplit(u).path
        b = check(p)
        if b is not None and len(pages) < 6:
            pages[p] = b
    # assets of the checked pages
    n_assets = 0
    for p, b in pages.items():
        refs = set(re.findall(r'<(?:link|script|img|source)[^>]+?(?:href|src)="([^"]+)"', b.decode('utf-8', 'replace')))
        for r in refs:
            u = urllib.parse.urljoin(base + p, html.unescape(r))
            if urllib.parse.urlsplit(u).hostname not in (domain, 'www.' + domain):
                continue
            if not re.search(r'\.(css|js|mjs|woff2?|svg|png|webp|jpe?g|ico|avif|gif)(\?|$)', u):
                continue
            n_assets += 1
            st, _, hdr = get(u)
            if challenged(st, hdr):
                skipped += 1
            elif st != 200:
                bad.append(f'{st} asset {u}')
    # /go/ exits found on the checked pages
    gos = sorted({m for b in pages.values() for m in re.findall(r'href="(/(?:go|akce)/[^"?#]+)', b.decode('utf-8', 'replace'))})
    n_go = 0
    for g in rnd.sample(gos, min(5, len(gos))):
        st, body, hdr = get(base + g)
        if st in (301, 307, 308) and hdr.get('Location'):
            st, body, hdr = get(urllib.parse.urljoin(base + g, hdr['Location']))
        if challenged(st, hdr):
            skipped += 1
            continue
        tgt = re.search(rb'http-equiv="refresh" content="0;url=([^"]+)"', body or b'')
        if st == 200 and tgt:
            n_go += 1
        else:
            bad.append(f'{st} exit {g}')
    print(f'{domain}: {ok} pages OK, {n_assets} assets, {n_go} exits OK, {skipped} WAF-challenged (not checked), {len(bad)} failures')
    for b in bad[:20]:
        print('  FAIL', b)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
