#!/usr/bin/env python3
"""WAF of the kuzelnemiesta.sk zone after the WordPress → Worker cutover (2. 11. 2026).

    python3 scripts/zona-waf.py [--dry]

Backup first: backups/kuzelnemiesta-cf-zone-<date>/waf-custom.json (+ ratelimit.json).
  * WordPress-only rules out: "Challenge wp-login/xmlrpc …", "Challenge rehub_ajax …"
  * new rule "Blok PHP/WP sond" — the site has no PHP any more: *.php, /wp-admin, /wp-login, /wp-json, /xmlrpc → block
    (/wp-content/uploads/ stays: article photos are static files of the Worker)
  * kept as they are: "Blok bot" (SEO crawlers, Kenny decides), "Blokace mimo EU", "Challenge boti: spam cesty …"
  * rate limit /go/ + /api/: 20 requests / 10 s per IP → block 10 s (the Free plan allows one rule)
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            C.setdefault(k, v.strip('"\''))
ZONE = C.get('CF_ZONE_ID') or C['CF_ZONE']
H = {'X-Auth-Email': C['CF_EMAIL'], 'X-Auth-Key': C['CF_GLOBAL_API_KEY'], 'Content-Type': 'application/json'}
DRY = '--dry' in sys.argv


def api(method, path, body=None):
    req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/zones/{ZONE}{path}', method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        d = json.load(e)
        if e.code == 404 and method == 'GET':
            return d
        sys.exit(f'{method} {path}: {e.code} {d.get("errors")}')


d = f'/home/kenny/ai/backups/kuzelnemiesta-cf-zone-{datetime.date.today().isoformat()}'
os.makedirs(d, exist_ok=True)
waf = api('GET', '/rulesets/phases/http_request_firewall_custom/entrypoint')['result']
rl = api('GET', '/rulesets/phases/http_ratelimit/entrypoint').get('result') or {}
json.dump(waf, open(f'{d}/waf-custom.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rl, open(f'{d}/ratelimit.json', 'w'), ensure_ascii=False, indent=1)
print('backup:', d)

KEEP = ('id', 'action', 'expression', 'description', 'enabled', 'action_parameters', 'logging')
drop = ('Challenge wp-login', 'Challenge rehub_ajax', 'Blok PHP/WP sond')
rules = [{k: r[k] for k in KEEP if k in r} for r in waf['rules'] if not (r.get('description') or '').startswith(drop)]
probe = {'action': 'block', 'description': 'Blok PHP/WP sond (web bez PHP od 2. 11. 2026)',
         'expression': '(ends_with(http.request.uri.path, ".php") or starts_with(http.request.uri.path, "/wp-admin") or '
                       'starts_with(http.request.uri.path, "/wp-login") or starts_with(http.request.uri.path, "/wp-json") or '
                       'http.request.uri.path contains "xmlrpc")', 'enabled': True}
rules.insert(1, probe)
print('custom rules:', [r['description'] for r in rules])
limit = {'action': 'block', 'description': 'Rate limit /go/ + /api/ (20 req / 10 s na IP)',
         'expression': '(starts_with(http.request.uri.path, "/go/") or starts_with(http.request.uri.path, "/api/"))',
         'ratelimit': {'characteristics': ['ip.src', 'cf.colo.id'], 'period': 10, 'requests_per_period': 20, 'mitigation_timeout': 10},
         'enabled': True}
if DRY:
    sys.exit('dry run — nothing changed')
api('PUT', f"/rulesets/{waf['id']}", {'rules': rules})
if rl.get('id'):
    api('PUT', f"/rulesets/{rl['id']}", {'rules': [limit]})
else:
    api('PUT', '/rulesets/phases/http_ratelimit/entrypoint', {'rules': [limit]})
print('WAF + rate limit updated')
