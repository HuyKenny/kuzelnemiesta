#!/usr/bin/env python3
"""Clean-up of the `redirects` table (3. 11. 2026, SEO audit): rows inherited from WordPress (Rank Math 404 monitor,
taxonomy remaps) that hijack live URLs or redirect junk.

    python3 scripts/redirects-uklid.py <staging|production> [--dry]     (production needs KD_PRODUCTION_APPROVED=yes)

Deletes rows whose source is
  * a sitemap / any .xml, a paged listing (/…/page/N/), a city page (/lokalita/…)  — live routes of the Worker
  * scanner junk: dot-files, /wp-…, .php, files (images, pdf, js, css, txt, zip …), /cgi-bin, admin paths
  * a live slug (slugs table) — the page itself must answer
and collapses chains (A → B → C becomes A → C). Backup of the whole table: backups/kuzelnemiesta-redirects-<env>-<date>.json
"""
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env not in ('staging', 'production') or (env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes'):
    sys.exit(__doc__)
DRY = '--dry' in sys.argv
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            C.setdefault(k, v.strip('"\''))
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}


def wr(args):
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), *args], cwd=ROOT, env=ENV, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-1500:])
    return r.stdout


def query(sql):
    out = wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--json', '--command', sql])
    return json.loads(out[out.index('['):])[0]['results']


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


rows = query('SELECT from_path, to_path, status FROM redirects')
live = {r['slug'] for r in query('SELECT slug FROM slugs')}
bk = ROOT.parent.parent / f'backups/kuzelnemiesta-redirects-{env}-{datetime.date.today().isoformat()}.json'
json.dump(rows, open(bk, 'w'), ensure_ascii=False)
print('backup:', bk, len(rows), 'rows')

JUNK = re.compile(r'(^/\.|/\.[a-z]|^/wp-|\.php|/cgi-bin|admin|\.(xml|jpe?g|png|gif|webp|svg|ico|pdf|txt|js|css|zip|gz|sql|env|bak|ini|log|json|map)/?$)', re.I)
drop, why = [], {}
for r in rows:
    f = r['from_path']
    seg = f.strip('/').split('/')
    reason = ('xml' if f.endswith('.xml') else 'page' if re.search(r'/page/\d+/?$', f) else 'lokalita' if f.startswith('/lokalita/')
              else 'junk' if JUNK.search(f) else 'live' if len(seg) == 1 and seg[0] in live else '')
    if reason:
        drop.append(f)
        why[reason] = why.get(reason, 0) + 1
keep = {r['from_path']: r for r in rows if r['from_path'] not in set(drop)}
# chains: follow up to 5 hops inside the kept table
fix = []
for f, r in keep.items():
    to, n = r['to_path'], 0
    while to in keep and keep[to]['to_path'] != to and n < 5:
        to, n = keep[to]['to_path'], n + 1
    if n:
        fix.append((f, to))
print('delete:', why, '| chains collapsed:', len(fix), '| kept:', len(keep))
if DRY:
    sys.exit('dry run')
stmts = [f'DELETE FROM redirects WHERE from_path = {q(f)};' for f in drop] + [f'UPDATE redirects SET to_path = {q(t)} WHERE from_path = {q(f)};' for f, t in fix]
stmts.append("INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', CAST(strftime('%s','now') AS TEXT), datetime('now'));")
for i in range(0, len(stmts), 800):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as t:
        t.write('\n'.join(stmts[i:i + 800]) + '\n')
    wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--yes', '--file', t.name])
    os.unlink(t.name)
print('done')
