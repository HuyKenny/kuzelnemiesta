#!/usr/bin/env python3
"""GitHub secrets of the nightly static build (.github/workflows/static.yml). Run by Kenny on Malina:

    ! python3 scripts/static/setup-actions.py

Reads site.json "actions":
  repo      GitHub repo (public), e.g. HuyKenny/kakapo
  cred      the site's credentials file in ~/ai/credentials (STATE_KEY_STATIC + CF_API_TOKEN_STATIC are stored there)
  secrets   {"SECRET_NAME": "<cred file>:<KEY>"} copied 1:1
  feeds_ce  Content Egg feeds export (feeds.Feed__<n>.feed_url -> FEED_URL_<n>)
  feed_urls {"FEED_URL_<id>": "<cred file>:<KEY>" | "<feeds json>#<key>"} + every FEED_URL_<id>=… line of the cred file -> one secret FEED_URLS_JSON
1. STATE_KEY: generated once (encrypts the state release asset and the feed files between jobs).
2. CLOUDFLARE_API_TOKEN: a scoped token, created once — Workers Scripts Write (account; + Workers R2 Storage Write when
   "r2_write": true, eroka thumbnails) + Workers Routes Write and Zone Read (only the site's zone). CLOUDFLARE_ACCOUNT_ID alongside.
Idempotent (existing key/token are reused). Prints only names and "ok", never values.
"""
import json
import secrets as pysecrets
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = json.loads((HERE / 'site.json').read_text())
A = SITE['actions']
CRED = Path('/home/kenny/ai/credentials')
REPO = A['repo']


def env(name):
    p = CRED / name
    if not p.exists():
        return {}
    return {k.strip(): v.strip().strip('"\'') for k, _, v in (l.partition('=') for l in p.read_text().splitlines())
            if _ and not k.lstrip().startswith('#')}


def save(key, value):
    p = CRED / A['cred']
    p.write_text(p.read_text().rstrip('\n') + f'\n{key}={value}\n')
    p.chmod(0o600)


def secret(name, value):
    subprocess.run(['gh', 'secret', 'set', name, '-R', REPO], input=value.encode(), check=True, capture_output=True)
    print(f'ok: secret {name}')


site_env = env(A['cred'])
cf = env('.cloudflare-credentials.env')
missing = []
for name, ref in A.get('secrets', {}).items():
    f, _, k = ref.partition(':')
    v = env(f).get(k)
    if v:
        secret(name, v)
    else:
        missing.append(f'{name} ({f}:{k})')

feeds = {k: v for k, v in site_env.items() if k.startswith('FEED_URL_') and v}
for name, ref in A.get('feed_urls', {}).items():
    if '#' in ref:   # "<feeds json>#<key>": a feed URL another site of the portfolio already uses (same partner export)
        f, _, k = ref.partition('#')
        v = json.loads((CRED / f).read_text()).get(k) if (CRED / f).exists() else None
        v = v.replace('http://', 'https://') if isinstance(v, str) else v
    else:
        f, _, k = ref.partition(':')
        v = env(f).get(k)
    if v:
        feeds.setdefault(name, v)
    else:
        missing.append(f'{name} ({ref})')
if A.get('feeds_ce'):   # Content Egg export (alkoholicky, eroka): feeds.Feed__<n>.feed_url -> FEED_URL_<n>
    for k, v in json.loads((CRED / A['feeds_ce']).read_text())['feeds'].items():
        if v.get('feed_url'):
            feeds.setdefault(f"FEED_URL_{k.split('__')[1]}", v['feed_url'])
if A.get('feed_urls') is not None or feeds:
    secret('FEED_URLS_JSON', json.dumps(feeds))
    print(f'   ({len(feeds)} feed URLs)')

key = site_env.get('STATE_KEY_STATIC')
if not key:
    key = pysecrets.token_urlsafe(48)
    save('STATE_KEY_STATIC', key)
    print('ok: STATE_KEY_STATIC generated and saved')
secret('STATE_KEY', key)

H = {'X-Auth-Email': cf['CF_EMAIL'], 'X-Auth-Key': cf.get('CF_GLOBAL_API_KEY') or cf['CF_API_KEY'], 'Content-Type': 'application/json'}


def api(method, path, body=None):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4' + path, data=json.dumps(body).encode() if body else None,
                                 headers=H, method=method)
    return json.load(urllib.request.urlopen(req, timeout=30))


acc = cf.get('CF_ACCOUNT_ID') or api('GET', '/accounts')['result'][0]['id']
secret('CLOUDFLARE_ACCOUNT_ID', acc)
tok = site_env.get('CF_API_TOKEN_STATIC')
if not tok:
    zone = api('GET', f'/zones?name={A.get("zone", SITE["domain"])}')['result'][0]['id']
    groups = {g['name']: g['id'] for g in api('GET', '/user/tokens/permission_groups')['result']}
    body = {'name': f'{SITE["domain"]} nightly static deploy (GitHub Actions {REPO})', 'policies': [
        {'effect': 'allow', 'resources': {f'com.cloudflare.api.account.{acc}': '*'},
         'permission_groups': [{'id': groups['Workers Scripts Write']}] + ([{'id': groups['Workers R2 Storage Write']}] if A.get('r2_write') else [])},
        {'effect': 'allow', 'resources': {f'com.cloudflare.api.account.zone.{zone}': '*'},
         'permission_groups': [{'id': groups['Workers Routes Write']}, {'id': groups['Zone Read']}]}]}
    r = api('POST', '/user/tokens', body)
    if not r.get('success'):
        sys.exit(f'token not created: {r.get("errors")}')
    tok = r['result']['value']
    save('CF_API_TOKEN_STATIC', tok)
    print(f'ok: token created, saved to credentials/{A["cred"]} as CF_API_TOKEN_STATIC')
secret('CLOUDFLARE_API_TOKEN', tok)
if missing:
    print('MISSING (secret not set):', ', '.join(missing))
