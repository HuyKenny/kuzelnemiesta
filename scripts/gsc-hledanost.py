#!/usr/bin/env python3
"""Search Console impressions (90 days) of every offer page → products.search_impr (the "searches" part of the ranking).

    python3 scripts/gsc-hledanost.py <staging|production>
Weekly from cron (bin/kuzelnemiesta-tydne.sh). The service account is the one of bin/gsc-hlidac.py.
"""
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import jwt  # PyJWT

env = sys.argv[1] if len(sys.argv) > 1 else 'staging'
ROOT = Path(__file__).resolve().parent.parent
KEY = Path('/home/kenny/.config/gsc/service-account.json')


def token():
    d = json.loads(KEY.read_text())
    now = int(time.time())
    a = jwt.encode({'iss': d['client_email'], 'scope': 'https://www.googleapis.com/auth/webmasters.readonly', 'aud': 'https://oauth2.googleapis.com/token',
                    'iat': now, 'exp': now + 3600}, d['private_key'], algorithm='RS256')
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': a}).encode()
    return json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body, timeout=30))['access_token']


TOK = token()


def api(path, body=None):
    req = urllib.request.Request('https://www.googleapis.com/webmasters/v3/' + path, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=120))


sites = [s['siteUrl'] for s in api('sites').get('siteEntry', []) if 'kuzelnemiesta' in s['siteUrl']]
if not sites:
    sys.exit('no Search Console property for kuzelnemiesta.sk')
site = next((s for s in sites if s.startswith('sc-domain')), sites[0])
end = dt.date.today() - dt.timedelta(days=3)
start = end - dt.timedelta(days=89)
q = urllib.parse.quote(site, safe='')
rows, offset = [], 0
while True:
    r = api(f'sites/{q}/searchAnalytics/query', {'startDate': str(start), 'endDate': str(end), 'dimensions': ['page'], 'rowLimit': 25000, 'startRow': offset}).get('rows', [])
    rows += r
    if len(r) < 25000:
        break
    offset += 25000
print(site, len(rows), 'pages with impressions')
sql = ['UPDATE products SET search_impr = 0 WHERE search_impr <> 0;']
for r in rows:
    path = urllib.parse.urlparse(r['keys'][0]).path.strip('/')
    if path and '/' not in path:
        slug = path.replace("'", "''")
        sql.append(f"UPDATE products SET search_impr = {int(r['impressions'])} WHERE slug = '{slug}';")
p = f'/tmp/gsc-hledanost-{env}.sql'
Path(p).write_text('\n'.join(sql) + '\n')


def creds(f, k):
    for l in open('/home/kenny/ai/credentials/' + f):
        if l.startswith(k + '='):
            return l.strip().split('=', 1)[1].strip('"\'')


E = dict(os.environ, CLOUDFLARE_EMAIL=creds('.cloudflare-credentials.env', 'CF_EMAIL'), CLOUDFLARE_API_KEY=creds('.cloudflare-credentials.env', 'CF_GLOBAL_API_KEY'),
         CLOUDFLARE_ACCOUNT_ID=creds('.kuzelnemiesta-credentials.env', 'CF_ACCOUNT_ID'), PATH='/home/kenny/.nvm/versions/node/v22.23.1/bin:' + os.environ['PATH'])
E.pop('CF_EMAIL', None)
E.pop('CF_API_KEY', None)
out = subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--env', env, '--remote', '--file', p, '-y'], cwd=ROOT, env=E, capture_output=True, text=True)
print(out.stdout[-300:] or out.stderr[-300:])
