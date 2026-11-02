#!/usr/bin/env python3
"""Let AhrefsBot, SemrushBot and MJ12bot through the zone WAF of kouzelnydeda.cz (the "Shared BotGuard" rules block them).

Why: partners who buy an article check their dofollow link with Ahrefs/Semrush/Majestic; WordPress blocked these
crawlers (robots.txt + WAF), so the checks reported "no dofollow" (30. 10. 2026). Only these three tokens are removed
from the two BotGuard rules; everything else stays. Backup first: backups/kouzelnydeda-cf-zone-<date>/waf-custom.json.

    python3 apps/kouzelnydeda/scripts/waf-seo-crawlers.py
"""
import datetime
import json
import os
import urllib.request

c = {}
for l in open('/home/kenny/ai/credentials/.kouzelnydeda-credentials.env'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1)
        c[k] = v.strip('"\'')
Z = '4d5775ad839b1ae850df7473df71e2dd'
H = {'X-Auth-Email': c['CF_EMAIL'], 'X-Auth-Key': c['CF_API_KEY'], 'Content-Type': 'application/json'}
API = f'https://api.cloudflare.com/client/v4/zones/{Z}'


def api(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers=H, data=json.dumps(body).encode() if body is not None else None)
    return json.load(urllib.request.urlopen(req, timeout=60))


rs = api('GET', '/rulesets/phases/http_request_firewall_custom/entrypoint')['result']
d = f'/home/kenny/ai/backups/kouzelnydeda-cf-zone-{datetime.date.today().isoformat()}'
os.makedirs(d, exist_ok=True)
json.dump(rs, open(f'{d}/waf-custom-pred-seo-crawlery.json', 'w'), ensure_ascii=False, indent=1)
for r in rs['rules']:
    if not r.get('description', '').startswith('Shared BotGuard'):
        continue
    e = r['expression']
    for b in ('ahrefsbot', 'semrushbot', 'mj12bot'):
        for pat in (f' or (lower(http.user_agent) contains "{b}")', f'(lower(http.user_agent) contains "{b}") or ',
                    f'lower(http.user_agent) contains "{b}" or ', f' or lower(http.user_agent) contains "{b}"'):
            e = e.replace(pat, '')
    if any(b in e for b in ('ahrefsbot', 'semrushbot', 'mj12bot')):
        raise SystemExit(f'could not remove the crawler from: {r["description"]}')
    if e == r['expression']:
        print('unchanged:', r['description'])
        continue
    body = {k: r[k] for k in ('action', 'description', 'enabled', 'action_parameters') if k in r}
    body['expression'] = e
    res = api('PATCH', f"/rulesets/{rs['id']}/rules/{r['id']}", body)
    print(r['description'][:70], '→', 'ok' if res.get('success') else res.get('errors'))
print('backup:', d)
