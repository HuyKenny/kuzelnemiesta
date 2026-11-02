#!/usr/bin/env python3
"""Content-gap content → D1 (3. 11. 2026). Idempotent.

    python3 scripts/darky-clanky-apply.py <staging|production> [--gifts] [--articles FILE] [--cats FILE]   (production needs KD_PRODUCTION_APPROVED=yes)

--gifts          register every landing of src/data/darky.json in `slugs` (kind gift, ref_id = position) and drop redirect rows
                 that would hijack them (the middleware ignores them for live slugs anyway)
--articles FILE  blog posts from tmp/kuzel-gap/clanky.json → posts + slugs (a draft_id replaces that draft row); published now
--cats FILE      seo_title + texts of categories from tmp/kuzel-gap/kategorie-gap.json (categories.seo_title/description_html/body_html/faq_json)
"""
import datetime, json, os, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env not in ('staging', 'production') or (env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes'):
    sys.exit(__doc__)
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1); C.setdefault(k, v.strip('"\''))
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}
def wr(args):
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), *args], cwd=ROOT, env=ENV, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-1200:])
    return r.stdout
def query(sql):
    out = wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--json', '--command', sql]); return json.loads(out[out.index('['):])[0]['results']
def run(stmts):
    for i in range(0, len(stmts), 20):
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as t:
            t.write('\n'.join(stmts[i:i + 20]) + '\n')
        wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--yes', '--file', t.name]); os.unlink(t.name)
q = lambda v: "'" + str(v).replace("'", "''") + "'"
def arg(flag):
    a = sys.argv; return a[a.index(flag) + 1] if flag in a else None
stmts = []
if '--gifts' in sys.argv:
    gifts = json.load(open(ROOT / 'src/data/darky.json'))['items']
    taken = {r['slug']: r['kind'] for r in query("SELECT slug, kind FROM slugs WHERE kind <> 'gift'")}
    for i, g in enumerate(gifts):
        if g['slug'] in taken: sys.exit(f"gift slug /{g['slug']}/ collides with a {taken[g['slug']]}")
        stmts.append(f"INSERT OR REPLACE INTO slugs (slug, kind, ref_id) VALUES ({q(g['slug'])}, 'gift', {i});")
        stmts.append(f"DELETE FROM redirects WHERE from_path = {q('/' + g['slug'] + '/')};")
    print('gifts:', len(gifts))
if arg('--articles'):
    arts = json.load(open(arg('--articles')))
    cats = {r['slug']: r['id'] for r in query('SELECT id, slug FROM post_categories')}
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    mx = max([r['m'] or 0 for r in query('SELECT MAX(id) AS m FROM posts')] + [2800000]) + 1
    for a in arts:
        have = query(f"SELECT id FROM posts WHERE type = 'post' AND slug = {q(a['slug'])}")
        pid = have[0]['id'] if have else a.get('draft_id') or mx
        if not have and not a.get('draft_id'): mx += 1
        stmts.append(f"DELETE FROM posts WHERE id = {int(pid)};")
        stmts.append(f"DELETE FROM posts WHERE type = 'post' AND slug = {q(a['slug'])};")
        stmts.append("INSERT INTO posts (id, type, slug, title, content_html, excerpt, published_at, modified_at, cat_id, author, seo_title, seo_desc, offers_cat, status) VALUES "
                     f"({int(pid)}, 'post', {q(a['slug'])}, {q(a['title'])}, {q(a['content_html'])}, {q(a.get('excerpt', ''))}, {q(now)}, {q(now)}, {cats.get(a.get('cat', ''), 0)}, 'Kúzelné miesta', {q(a['seo_title'])}, {q(a['seo_desc'])}, {q(a.get('offers_cat', ''))}, 'publish');")
        stmts.append(f"INSERT OR REPLACE INTO slugs (slug, kind, ref_id) VALUES ({q(a['slug'])}, 'post', {int(pid)});")
    print('articles:', len(arts))
if arg('--cats'):
    for slug, c in json.load(open(arg('--cats'))).items():
        sets = [f"seo_title = {q(c['seo_title'])}", f"description_html = {q(c['description_html'])}", f"body_html = {q(c['body_html'])}", f"faq_json = {q(json.dumps(c['faq_json'], ensure_ascii=False))}"]
        stmts.append(f"UPDATE categories SET {', '.join(sets)} WHERE slug = {q(slug)};")
if not stmts: sys.exit('nothing to do')
stmts.append("INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', CAST(strftime('%s','now') AS TEXT), datetime('now'));")
run(stmts); print('ok', len(stmts), 'statements')
