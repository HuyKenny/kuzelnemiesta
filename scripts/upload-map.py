#!/usr/bin/env python3
"""Loads the WordPress upload → offer map into D1 (table upload_map, migration 0011). Idempotent.

    python3 scripts/upload-map.py <staging|production> [map.json]     (production needs KD_PRODUCTION_APPROVED=yes)

map.json = {"<stem>": product_id} built from the WP export (product_thumbs + attachments with post_parent = offer);
default: backups/kuzelnemiesta-obsah-2026-11-02/upload-map.json
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env not in ('staging', 'production') or (env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes'):
    sys.exit(__doc__)
src = sys.argv[2] if len(sys.argv) > 2 else '/home/kenny/ai/backups/kuzelnemiesta-obsah-2026-11-02/upload-map.json'
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            C.setdefault(k, v.strip('"\''))
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}
m = json.load(open(src))
rows = [f"('{k.replace(chr(39), chr(39) * 2)}', {int(v)})" for k, v in m.items()]
stmts = [f"INSERT OR REPLACE INTO upload_map (stem, product_id) VALUES {', '.join(rows[i:i + 400])};" for i in range(0, len(rows), 400)]
for i in range(0, len(stmts), 20):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as t:
        t.write('\n'.join(stmts[i:i + 20]) + '\n')
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--env', env, '--remote', '--yes', '--file', t.name], cwd=ROOT, env=ENV, capture_output=True, text=True)
    os.unlink(t.name)
    if r.returncode:
        sys.exit(r.stderr[-800:])
print('upload_map rows:', len(rows))
