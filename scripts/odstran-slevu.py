#!/usr/bin/env python3
"""One-off (30. 10. 2026): the site is a gift/experience portal, "sleva" put people off — rewrites the word out of the
texts stored in D1 (category descriptions + SEO fields, blog posts). Code strings were changed in the sources.

    python3 scripts/odstran-slevu.py <staging|production> [--dry]     (production needs KD_PRODUCTION_APPROVED=yes)
"""
import json, os, re, subprocess, sys, tempfile
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes':
    sys.exit('production needs KD_PRODUCTION_APPROVED=yes')
DRY = '--dry' in sys.argv
D1 = '/tmp/claude-1000/-home-kenny-ai/afc56585-7a0d-4840-80f5-7e0ef06ffd13/scratchpad/d1.sh'
RULES = [
    (r'původní cenu, slevu i úsporu', 'původní cenu i úsporu'),
    (r'výši slevy i kolik', 'kolik'), (r'aktuální slevu i kolik', 'kolik'),
    (r'uvidíte slevu i úsporu', 'uvidíte úsporu'),
    (r'(a )?aktuální slevy', r'\1aktuální nabídky'),
    (r'(\w) se slevou(?=[.<])', r'\1 výhodněji'),
    (r' se slevou', ''),
    (r'slevy a nabídky', 'nabídky'), (r'slevy a výhodné', 'výhodné'), (r'slevy a výhody', 'výhody'), (r'slevy a speciální', 'speciální'),
    (r'slev a nabídek', 'nabídek'), (r'slev na ', 'výhodných nabídek na '), (r'slevy na ', 'výhodné nabídky na '),
    (r'slevové kódy', 'kódy'), (r'slevové poukazy', 'poukazy'), (r'slevové nabídky', 'výhodné nabídky'), (r'slevové akce', 'akční nabídky'),
    (r'slevovými portály', 'portály s nabídkami'), (r'Slevové akce', 'Akční nabídky'),
    (r'akční slevou', 'akční nabídkou'), (r'množstevní slevu', 'množstevní výhodu'), (r'slevu', 'výhodu'), (r'slevou', 'výhodou'),
    (r'slevám', 'výhodám'), (r'slevy', 'výhodné nabídky'), (r'sleva', 'výhoda'), (r'slevičku', 'výhodu'),
    (r'\bslev\b', 'výhod'),
    (r'Slevy', 'Nabídky'), (r'Sleva(?!omat)', 'Výhoda'), (r'Slevu', 'Výhodu'),
]
def fix(s):
    if not s: return s
    for a, b in RULES:
        s = re.sub(a, b, s)
    return s
def q(sql):
    out = subprocess.run(['bash', D1, env, sql], capture_output=True, text=True).stdout
    return json.loads(out[out.index('['):])[0]['results']
def lit(s): return "'" + s.replace("'", "''") + "'"
stmts = []
for table, cols in (('posts', ['title', 'excerpt', 'seo_title', 'seo_desc', 'content_html']), ('categories', ['description_html', 'seo_title', 'seo_desc'])):
    where = ' OR '.join(f"{c} LIKE '%slev%'" for c in cols)
    for r in q(f"SELECT id, {', '.join(cols)} FROM {table} WHERE {where}"):
        ch = {c: fix(r[c]) for c in cols if r[c] and fix(r[c]) != r[c]}
        # Slevomat (the partner) must survive: it never matches "slev" + rule words, but protect the name anyway
        for c, v in ch.items():
            assert 'výhodomat' not in v and 'nabídkyomat' not in v, (table, r['id'], c)
        if ch: stmts.append(f"UPDATE {table} SET {', '.join(f'{c} = {lit(v)}' for c, v in ch.items())} WHERE id = {r['id']};")
print(len(stmts), 'rows to update')
if DRY: sys.exit()
with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/home/kenny/ai/tmp') as f:
    f.write('\n'.join(stmts)); path = f.name
rd = lambda k: [l.split('=', 1)[1].strip().strip('"\'') for l in open(f'/home/kenny/ai/credentials/{k[0]}') if l.startswith(k[1] + '=')][0]
e = {**os.environ, 'PATH': '/home/kenny/.nvm/versions/node/v22.23.1/bin:' + os.environ['PATH'], 'CLOUDFLARE_EMAIL': rd(('.cloudflare-credentials.env', 'CF_EMAIL')),
     'CLOUDFLARE_API_KEY': rd(('.cloudflare-credentials.env', 'CF_GLOBAL_API_KEY')), 'CLOUDFLARE_ACCOUNT_ID': rd(('.kouzelnydeda-credentials.env', 'CF_ACCOUNT_ID'))}
r = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--env', env, '--remote', '--file', path], cwd='/home/kenny/ai/apps/kouzelnydeda', env=e, capture_output=True, text=True)
print('ok' if r.returncode == 0 else 'FAILED\n' + r.stderr[-800:]); os.unlink(path)
