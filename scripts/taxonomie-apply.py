#!/usr/bin/env python3
"""Redesign v2 (31. 10. 2026): replaces the Slevomat category tree in D1 with src/data/taxonomie.json.

    python3 scripts/taxonomie-apply.py <local|staging|production> [--dry]   (production needs KD_PRODUCTION_APPROVED=yes)

Needs migration 0002 applied. Reads the current D1 (categories, products, redirects, posts), writes SQL to tmp/kouzelnydeda/
and executes it file by file:
  * new categories (ids 300000+) with icon/group/short, SEO text carried over from the biggest old category with one
  * cat_alias: every old "<root name>|<child name>" → its new node (the importer resolves feed categories through it)
  * products: cat_ids/primary_cat remapped; offers whose only categories are goods-like (taxonomie.json "skip") end
  * cat_products rebuilt for active offers (every ancestor), old categories + their slugs removed
  * 301 from every old category URL to its node (existing redirects to old categories retargeted, no chains)
  * gift landings (src/data/darky.json) as slugs kind 'gift' (ref_id = position)
  * posts.offers_cat remapped
Backup: deploy.ts writes a D1 Time Travel bookmark before every deploy; this script stores the old tree as JSON.
"""
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes':
    sys.exit('production needs KD_PRODUCTION_APPROVED=yes')
DRY = '--dry' in sys.argv
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
OUT = Path('/home/kenny/ai/tmp/kouzelnydeda/taxonomie-' + env)
OUT.mkdir(parents=True, exist_ok=True)


def creds():
    c = {}
    for f in ('.cloudflare-credentials.env', '.kouzelnydeda-credentials.env'):
        for line in open(f'/home/kenny/ai/credentials/{f}'):
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                c.setdefault(k, v.strip('"\''))
    return c


C = creds()
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}
WHERE = ['--local', '--persist-to', '.wrangler/state'] if env == 'local' else ['--env', env, '--remote']


def wr(args, inp=None):
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), *args], cwd=ROOT, env=ENV, capture_output=True, text=True, input=inp)
    if r.returncode:
        sys.exit(f'wrangler failed: {" ".join(args)[:200]}\n{r.stderr[-1500:]}')
    return r.stdout


def query(sql):
    out = wr(['d1', 'execute', 'DB', *WHERE, '--json', '--command', sql])
    return json.loads(out[out.index('['):])[0]['results']


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


tx = json.load(open(ROOT / 'src/data/taxonomie.json'))
gifts = json.load(open(ROOT / 'src/data/darky.json'))['items']
nodes = tx['nodes']
by_slug = {n['slug']: n for n in nodes}
new_id = {n['slug']: 300000 + i for i, n in enumerate(nodes)}

old = query('SELECT id, slug, name, parent, description_html, seo_desc, count_total FROM categories')
if any(c['id'] >= 300000 for c in old):
    sys.exit('categories already contain the new tree (ids ≥ 300000) — nothing to do')
oby = {c['id']: c for c in old}
json.dump(old, open(OUT / f'old-categories-{datetime.now():%Y%m%d-%H%M}.json', 'w'), ensure_ascii=False, indent=0)


def old_root(c):
    seen = set()
    while c['parent'] and c['parent'] in oby and c['id'] not in seen:
        seen.add(c['id'])
        c = oby[c['parent']]
    return c


target = {}  # old category id → new node slug
from_map = {s: n['slug'] for n in nodes for s in n['from']}
for c in old:
    target[c['id']] = from_map.get(c['slug']) or tx['roots'].get(old_root(c)['slug'], 'zazitky')
skip_ids = {c['id'] for c in old if c['slug'] in tx['skip']}
root_ids = {c['id'] for c in old if not c['parent']}

# new nodes: depth, ancestors
def anc(slug):
    out = []
    while slug:
        out.append(slug)
        slug = by_slug[slug]['parent']
    return out


stmts = defaultdict(list)
# 1. categories
for i, n in enumerate(nodes):
    srcs = [oby[c] for c in oby if target[c] == n['slug'] and oby[c]['slug'] in n['from']]
    srcs.sort(key=lambda c: -c['count_total'])
    desc = next((c['description_html'] for c in srcs if (c['description_html'] or '').strip()), '')
    seo_desc = next((c['seo_desc'] for c in srcs if (c['seo_desc'] or '').strip()), '')
    stmts['10-categories'].append(
        'INSERT INTO categories (id, slug, name, parent, description_html, seo_desc, icon, grp, short, sort, created_at) VALUES '
        f"({new_id[n['slug']]}, {q(n['slug'])}, {q(n['name'])}, {new_id[n['parent']] if n['parent'] else 0}, {q(desc)}, {q(seo_desc)}, "
        f"{q(n.get('icon', ''))}, {q(n.get('group', ''))}, {q(n.get('short', ''))}, {i}, datetime('now'));")
# 2. aliases (feed paths)
for c in old:
    r = old_root(c)
    key = '|' + c['name'].strip().lower() if c['id'] == r['id'] else r['name'].strip().lower() + '|' + c['name'].strip().lower()
    stmts['11-alias'].append(f"INSERT OR REPLACE INTO cat_alias (feed_key, cat_id) VALUES ({q(key)}, {new_id[target[c['id']]]});")
# 3. products
prods = query('SELECT id, cat_ids, primary_cat, created_at, price, disc_pct, pop, lok_id, active FROM products')
counts = defaultdict(int)
remapped = {}
ended = 0
for p in prods:
    try:
        ids = [int(x) for x in json.loads(p['cat_ids'] or '[]')]
    except ValueError:
        ids = []
    ids = [i for i in ids if i in oby]
    goods = bool(ids) and any(i in skip_ids for i in ids) and all(i in skip_ids or i in root_ids for i in ids)
    new = []
    for i in ids:
        s = target[i]
        if s not in new:
            new.append(s)
    # a node already covered by a more specific one stays (it is the listing the offer was assigned to)
    deepest = max(new, key=lambda s: (len(anc(s)), -nodes.index(by_slug[s]))) if new else ''
    prim = target.get(p['primary_cat']) if p['primary_cat'] in oby else deepest
    if prim and len(anc(prim)) < len(anc(deepest)):
        prim = deepest
    remapped[p['id']] = (new, prim)
    if goods and p['active']:
        ended += 1
        stmts['20-products'].append(f"UPDATE products SET active = 0, expired_at = datetime('now', '-31 days') WHERE id = {p['id']};")
        p['active'] = 0
    stmts['20-products'].append(f"UPDATE products SET cat_ids = {q(json.dumps([new_id[s] for s in new]))}, primary_cat = {new_id[prim] if prim else 0} WHERE id = {p['id']};")
    if p['active']:
        members = {}
        for s in new:
            for a in anc(s):
                members[a] = max(members.get(a, 0), 1 if a == s else 0)
        for s, d in members.items():
            counts[s] += 1
            stmts['30-members'].append((new_id[s], p['created_at'], p['id'], d, p['price'], p['disc_pct'], p['pop'], p['lok_id']))
# 4. old categories out, slugs, redirects, posts
stmts['05-cleanup'] += ['DELETE FROM cat_products;', 'DELETE FROM categories WHERE id < 300000;', "DELETE FROM slugs WHERE kind = 'category';"]
taken = {r['slug']: r['kind'] for r in query("SELECT slug, kind FROM slugs WHERE kind <> 'category'")}
for n in nodes:
    if n['slug'] in taken:
        sys.exit(f"slug collision: /{n['slug']}/ is already a {taken[n['slug']]}")
    stmts['41-slugs'].append(f"INSERT INTO slugs (slug, kind, ref_id) VALUES ({q(n['slug'])}, 'category', {new_id[n['slug']]});")
for i, g in enumerate(gifts):
    if g['slug'] in taken or g['slug'] in by_slug:
        sys.exit(f"gift slug collision: /{g['slug']}/")
    stmts['41-slugs'].append(f"INSERT INTO slugs (slug, kind, ref_id) VALUES ({q(g['slug'])}, 'gift', {i});")
new_paths = {f"/{n['slug']}/" for n in nodes} | {f"/{g['slug']}/" for g in gifts}
old_to = {f"/{c['slug']}/": f"/{target[c['id']]}/" for c in old}
for frm, to in old_to.items():
    if frm != to and frm not in new_paths:
        stmts['42-redirects'].append(f"INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ({q(frm)}, {q(to)}, 301);")
for r in query('SELECT from_path, to_path FROM redirects'):
    if r['from_path'] in new_paths:
        stmts['42-redirects'].append(f"DELETE FROM redirects WHERE from_path = {q(r['from_path'])};")
    elif r['to_path'] in old_to and old_to[r['to_path']] != r['to_path']:
        stmts['42-redirects'].append(f"UPDATE redirects SET to_path = {q(old_to[r['to_path']])} WHERE from_path = {q(r['from_path'])};")
    elif r['to_path'].startswith('/') and '/lokalita/' in r['to_path']:
        seg = r['to_path'].strip('/').split('/')
        if len(seg) == 3 and f'/{seg[0]}/' in old_to:
            stmts['42-redirects'].append(f"UPDATE redirects SET to_path = {q(old_to[f'/{seg[0]}/'] + 'lokalita/' + seg[2] + '/')} WHERE from_path = {q(r['from_path'])};")
oslug = {c['slug']: target[c['id']] for c in old}
for p in query("SELECT id, offers_cat FROM posts WHERE offers_cat <> ''"):
    if p['offers_cat'] in oslug and p['offers_cat'] != oslug[p['offers_cat']]:
        stmts['43-posts'].append(f"UPDATE posts SET offers_cat = {q(oslug[p['offers_cat']])} WHERE id = {p['id']};")
for s, n in counts.items():
    stmts['44-counts'].append(f"UPDATE categories SET count_total = {n} WHERE id = {new_id[s]};")
stmts['45-cache'].append("DELETE FROM site_cache WHERE key IN ('combos', 'import:finalized');")
stmts['45-cache'].append("INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', datetime('now') || '-taxonomie', datetime('now'));")

# write files (members as multi-row inserts, ≤ 12 rows = 96 params-free literals per statement)
files = []
def write(name, lines):
    for i in range(0, len(lines), 400):
        p = OUT / f'{name}-{i // 400:03d}.sql'
        p.write_text('\n'.join(lines[i:i + 400]) + '\n')
        files.append(p)

for f in OUT.glob('*.sql'):
    f.unlink()
for k in sorted(stmts):
    if k == '30-members':
        rows = stmts[k]
        lines = []
        for i in range(0, len(rows), 50):
            part = rows[i:i + 50]
            lines.append('INSERT OR REPLACE INTO cat_products (cat_id, created_at, product_id, direct, price, disc, pop, lok_id) VALUES '
                         + ', '.join('(' + ', '.join(q(v) for v in r) + ')' for r in part) + ';')
        # cat_products is filled after the cleanup (05) and the new categories
        write('50-members', lines)
    else:
        write(k, stmts[k])
files.sort()
print(f"nodes {len(nodes)}, gifts {len(gifts)}, products {len(prods)} (goods-like ended {ended}), members {len(stmts['30-members'])}, "
      f"redirects +{len(stmts['42-redirects'])}, files {len(files)} → {OUT}")
if DRY:
    sys.exit(0)
for f in files:
    wr(['d1', 'execute', 'DB', *WHERE, '--yes', '--file', str(f)])
    print('ok', f.name, flush=True)
print(query('SELECT (SELECT COUNT(*) FROM categories) cats, (SELECT COUNT(*) FROM cat_products) members, (SELECT COUNT(*) FROM cat_alias) alias, (SELECT COUNT(*) FROM products WHERE active = 1) active'))
