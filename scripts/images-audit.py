#!/usr/bin/env python3
"""Dead main photos of active offers (partner deleted the file, HTTP 404/410).

The first live photo of `images` takes over; an offer without any live photo is deactivated (its page says "ended" and
points to alternatives, as when an import finds no photo). Other statuses (403, 5xx, timeouts) count as alive.

    python3 scripts/images-audit.py <staging|production> [--dry]
"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

env = sys.argv[1] if len(sys.argv) > 1 else 'staging'
dry = '--dry' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def creds(f, k):
    for l in open('/home/kenny/ai/credentials/' + f):
        if l.startswith(k + '='):
            return l.strip().split('=', 1)[1].strip('"\'')


E = dict(os.environ, CLOUDFLARE_EMAIL=creds('.cloudflare-credentials.env', 'CF_EMAIL'), CLOUDFLARE_API_KEY=creds('.cloudflare-credentials.env', 'CF_GLOBAL_API_KEY'),
         CLOUDFLARE_ACCOUNT_ID=creds('.kouzelnydeda-credentials.env', 'CF_ACCOUNT_ID'),
         PATH='/home/kenny/.nvm/versions/node/v22.23.1/bin:' + os.environ['PATH'])
E.pop('CF_EMAIL', None)
E.pop('CF_API_KEY', None)


def d1(sql, file=False):
    a = ['npx', 'wrangler', 'd1', 'execute', 'DB', '--env', env, '--remote', '--json', '--file' if file else '--command', sql]
    r = subprocess.run(a, cwd=ROOT, env=E, capture_output=True, text=True)
    return json.loads(r.stdout)[0].get('results', []) if not file else r.stdout[-200:]


rows = d1("SELECT id, image, images FROM products WHERE active = 1 AND image <> ''")
print(len(rows), 'active offers')


def dead(url):
    for m in ('HEAD', 'GET'):
        try:
            req = urllib.request.Request(url, method=m, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36'})
            urllib.request.urlopen(req, timeout=15).close()
            return False
        except urllib.error.HTTPError as e:
            if e.code in (404, 410) and m == 'GET':
                return True
            if e.code not in (404, 410, 405, 403):
                return False
        except Exception:
            return False
    return False


with cf.ThreadPoolExecutor(8) as ex:
    flags = list(ex.map(lambda r: dead(r['image']), rows))
bad = [r for r, f in zip(rows, flags) if f]
print(len(bad), 'dead main photos')
sql = []
for r in bad:
    alts = [u for u in json.loads(r['images'] or '[]') if u != r['image']]
    live = next((u for u in alts if not dead(u)), None)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    if live:
        rest = [u for u in alts if u != live]
        sql.append(f"UPDATE products SET image={q(live)}, images={q(json.dumps(rest))} WHERE id={r['id']};")
    else:
        sql.append(f"UPDATE products SET active=0, expired_at=datetime('now') WHERE id={r['id']};")
        sql.append(f"DELETE FROM cat_products WHERE product_id={r['id']};")
    print(r['id'], 'replace' if live else 'DEACTIVATE', r['image'][:90])
if sql and not dry:
    p = f'/tmp/images-audit-{env}.sql'
    open(p, 'w').write('\n'.join(sql) + '\n')
    print(d1(p, file=True))
    print('now run /finalize?force=1 and purge the cache')
