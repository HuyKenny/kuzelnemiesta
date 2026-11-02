#!/usr/bin/env python3
"""Slovak copy → D1 (2. 11. 2026): category texts and the legal/about pages written for kuzelnemiesta.sk.

    python3 scripts/obsah-apply.py <staging|production> [--legal FILE] [--cats FILE ...]   (production needs KD_PRODUCTION_APPROVED=yes)

--legal FILE: {"<page slug>": {"title", "content_html", "seo_title", "seo_desc"}} → posts (type page) by slug
--cats FILE:  {"<category slug>": {"description_html", "body_html", "faq_json": [{"q","a"}]}} → categories by slug
Sources live outside git (tmp/kuzel-legal.json, tmp/kuzel-cat-texts-*.json); a copy is kept in backups/.
"""
import json
import os
import subprocess
import sys
import tempfile
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
            k, v = line.strip().split('=', 1)
            C.setdefault(k, v.strip('"\''))
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def args(flag):
    a = sys.argv
    return [a[i + 1] for i, x in enumerate(a) if x == flag and i + 1 < len(a)]


stmts = []
for f in args('--legal'):
    for slug, p in json.load(open(f)).items():
        stmts.append(f"UPDATE posts SET title = {q(p['title'])}, content_html = {q(p['content_html'])}, seo_title = {q(p['seo_title'])}, "
                     f"seo_desc = {q(p['seo_desc'])}, modified_at = datetime('now') WHERE type = 'page' AND slug = {q(slug)};")
for f in args('--cats'):
    for slug, c in json.load(open(f)).items():
        stmts.append(f"UPDATE categories SET description_html = {q(c['description_html'])}, body_html = {q(c['body_html'])}, "
                     f"faq_json = {q(json.dumps(c['faq_json'], ensure_ascii=False))} WHERE slug = {q(slug)};")
if not stmts:
    sys.exit('nothing to apply')
stmts.append("INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', CAST(strftime('%s','now') AS TEXT), datetime('now'));")
# D1: one statement < 100 kB, files of ~2 MB
chunks, cur, size = [], [], 0
for s in stmts:
    if cur and size + len(s.encode()) > 1_800_000:
        chunks.append(cur)
        cur, size = [], 0
    cur.append(s)
    size += len(s.encode())
chunks.append(cur)
for i, ch in enumerate(chunks):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as t:
        t.write('\n'.join(ch) + '\n')
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--env', env, '--remote', '--yes', '--file', t.name],
                       cwd=ROOT, env=ENV, capture_output=True, text=True)
    os.unlink(t.name)
    if r.returncode:
        sys.exit(f'chunk {i} failed: {r.stderr[-1200:]}')
    print(f'ok chunk {i + 1}/{len(chunks)} ({len(ch)} statements)')
