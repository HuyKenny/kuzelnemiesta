#!/usr/bin/env python3
"""SEO parity of a new environment against the snapshot of the live WordPress (scripts/live-meta-snapshot.py, 30. 10. 2026).

    python3 scripts/seo-parity.py <base-url> <live-meta.json> [--out report.json] [--skip field,field]

Hard fields (count toward parity): status, redirect target, canonical path, robots, title, description, H1.
Staging is behind Access: the service token is sent for *.workers.dev hosts. Offers that ended since the snapshot
(page "skončila", noindex) are reported separately — that is the feed moving on, not a migration difference.
"""
import concurrent.futures as cf
import html
import json
import re
import subprocess
import sys
from urllib.parse import urlparse

base = sys.argv[1].rstrip('/')
snap = json.load(open(sys.argv[2]))
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
SKIP = sys.argv[sys.argv.index('--skip') + 1].split(',') if '--skip' in sys.argv else []


def creds(f):
    d = {}
    for line in open('/home/kenny/ai/credentials/' + f):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            d[k] = v.strip().strip('"\'')
    return d


sk = creds('.kuponmat-sk-credentials.env')


def fetch(path):
    cmd = ['curl', '-s', '-m', '60', '-4', '-A', 'MalinaCron/1.0 (kouzelnydeda parity)', '-o', '-', '-w', '\n__STATUS__%{http_code} %{redirect_url}', base + path]
    if base.endswith('workers.dev'):
        cmd[1:1] = ['-H', 'CF-Access-Client-Id: ' + sk['ACCESS_CLIENT_ID_STAGING'], '-H', 'CF-Access-Client-Secret: ' + sk['ACCESS_CLIENT_SECRET_STAGING']]
    r = subprocess.run(cmd, capture_output=True, text=True, errors='replace').stdout
    body, _, tail = r.rpartition('\n__STATUS__')
    st, _, loc = tail.partition(' ')
    return int(st or 0), loc.strip(), body


def norm(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s or ''))).strip().replace('\xa0', ' ').replace(' ', ' ')


def meta(body):
    g = lambda p: (re.search(p, body, re.S | re.I) or [None, ''])[1]
    return {
        'title': norm(g(r'<title[^>]*>(.*?)</title>')),
        'desc': norm(g(r'<meta name="description" content="([^"]*)"')),
        'canonical': urlparse(g(r'<link rel="canonical" href="([^"]*)"')).path,
        'robots': re.sub(r'\s+', '', g(r'<meta name="robots" content="([^"]*)"')),
        'h1': norm(g(r'<h1[^>]*>(.*?)</h1>')),
    }


HARD = [k for k in ['title', 'desc', 'canonical', 'robots', 'h1'] if k not in SKIP]


def check(item):
    p, ref = item
    st, loc, body = fetch(p)
    res = {'path': p, 'live': ref.get('status'), 'new': st, 'diff': [], 'ended': False}
    if ref.get('status') != st:
        res['diff'].append(f"status {ref.get('status')} vs {st}" + (f' → {urlparse(loc).path}' if loc else ''))
        return res
    if 300 <= st < 400:
        if urlparse(ref.get('location', '')).path != urlparse(loc).path:
            res['diff'].append(f"redirect {ref.get('location')} vs {urlparse(loc).path}")
        return res
    if st == 200:
        m = meta(body)
        if 'Tato nabídka už skončila' in body:
            res['ended'] = True
            return res
        r = {'title': norm(ref.get('title')), 'desc': norm(ref.get('desc')), 'canonical': urlparse(ref.get('canonical', '')).path,
             'robots': re.sub(r'\s+', '', ref.get('robots', '')), 'h1': norm(ref.get('h1'))}
        # offer counts in descriptions move with every import — compare the text around them
        r['desc'], m['desc'] = re.sub(r'\d[\d ]*', '#', r['desc']), re.sub(r'\d[\d ]*', '#', m['desc'])
        for k in HARD:
            if r[k] != m[k]:
                res['diff'].append(f'{k}: {r[k][:90]!r} vs {m[k][:90]!r}')
    return res


items = list(snap.items())
with cf.ThreadPoolExecutor(6) as ex:
    results = list(ex.map(check, items))
ended = [r for r in results if r['ended']]
bad = [r for r in results if r['diff']]
n = len(results) - len(ended)
print(f'checked {len(results)}, offers ended since the snapshot: {len(ended)}')
print(f'identical (hard fields): {n - len(bad)} / {n} = {100 * (n - len(bad)) / max(1, n):.1f} %')
kinds = {}
for r in bad:
    for d in r['diff']:
        k = d.split(':')[0].split(' ')[0]
        kinds[k] = kinds.get(k, 0) + 1
print('differences by field:', kinds)
for r in bad[:120]:
    print(r['path'], '|', '; '.join(r['diff']))
if out:
    json.dump(results, open(out, 'w'), ensure_ascii=False, indent=1)
