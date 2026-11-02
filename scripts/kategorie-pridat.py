#!/usr/bin/env python3
"""Adds the categories of src/data/kategorie-nove.json to D1 (idempotent): the feed classifier (workers/import/src/classify.ts)
puts offers of new partners into them by slug ("@slug").

    python3 scripts/kategorie-pridat.py <local|staging|production>     (production needs KD_PRODUCTION_APPROVED=yes)
"""
import json, os, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes':
    sys.exit('production needs KD_PRODUCTION_APPROVED=yes')
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
c = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1); c.setdefault(k, v.strip('"\''))
E = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': c['CF_EMAIL'], 'CLOUDFLARE_API_KEY': c['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': c['CF_ACCOUNT_ID']}
WHERE = ['--local', '--persist-to', '.wrangler/state'] if env == 'local' else ['--env', env, '--remote']
def q(sql):
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', *WHERE, '--json', '--command', sql], cwd=ROOT, env=E, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])
    return json.loads(r.stdout[r.stdout.index('['):])[0]['results']
nodes = json.load(open(ROOT / 'src/data/kategorie-nove.json'))
cats = {r['slug']: r for r in q('SELECT id, slug, parent, sort FROM categories')}
taken = {r['slug'] for r in q('SELECT slug FROM slugs')}
nid = max(r['id'] for r in cats.values()) + 1
stmts = []
for n in nodes:
    if n['slug'] in cats: continue
    if n['slug'] in taken: sys.exit(f"slug {n['slug']} is taken by another page")
    par = cats[n['parent']]
    sort = max([r['sort'] for r in cats.values() if r['parent'] == par['id']] + [par['sort']]) + 1
    cats[n['slug']] = {'id': nid, 'slug': n['slug'], 'parent': par['id'], 'sort': sort}
    esc = lambda s: s.replace("'", "''")
    stmts.append(f"INSERT INTO categories (id, slug, name, parent, icon, grp, short, sort, created_at) VALUES ({nid}, '{n['slug']}', '{esc(n['name'])}', {par['id']}, '{n['icon']}', '{esc(n.get('group', ''))}', '{esc(n.get('short', ''))}', {sort}, datetime('now'))")
    stmts.append(f"INSERT INTO slugs (slug, kind, ref_id) VALUES ('{n['slug']}', 'category', {nid})")
    nid += 1
print(len(stmts) // 2, 'new categories')
for s in stmts: q(s)
