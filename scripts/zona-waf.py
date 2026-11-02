#!/usr/bin/env python3
"""WAF of the kuzelnemiesta.sk zone (v2, 3. 11. 2026) — after the Worker cutover; patterns from kouzelnydeda
"Shared BotGuard" and apps/sporteka/scripts/zona-setup.py. Idempotent: PUTs the whole custom ruleset + rate limit.

    python3 scripts/zona-waf.py [--dry]

Backup first: backups/kuzelnemiesta-cf-zone-<date>/waf-custom.json + ratelimit.json.
Free plan: 5 custom rules, 4 096 characters each, no regex (`matches`), one rate-limit rule.

1. block   probes + attack tools + empty UA + methods the site does not use
2. block   unwanted crawlers (SEO, AI, scrapers) by name, unverified "bot/crawl/spider", verified bots outside
           Search Engine Crawler + Page Preview (link previews stay), scanner IPs, AS48090 (TECHOFF/DMZHOST)
3. block   outside Europe unless a verified bot — kept byte for byte from the live rule (carries the warm-up secret)
4. managed_challenge  script HTTP clients, cloud/datacenter ASNs, spam paths, really old browsers (Chrome < 100,
           old Firefox, MSIE) — robots.txt, sitemaps and the IndexNow key file stay open for everyone
Rate limit: /go/ and /api/ 20 requests / 10 s per IP → block 10 s (search: Worker RL_SEARCH).
Own scripts use UA "MalinaCron/…" from a residential IP and the health check runs on workers.dev: none of this hits them.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env', '.kuzelnemiesta-indexnow.env'):
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


P = 'http.request.uri.path'
UA = 'lower(http.user_agent)'


def anyof(field, op, values):
    return '(' + ' or '.join(f'{op}({field}, "{v}")' if op in ('starts_with', 'ends_with') else f'{field} {op} "{v}"' for v in values) + ')'


PROBE_PATHS = anyof(P, 'contains', ['/.env', '/.git', '/.aws', '/.ssh', '/.DS_Store', '/cgi-bin', '/actuator', '/phpmyadmin', '/pma/',
                                    '/vendor/phpunit', 'xmlrpc', 'phpinfo', '/wp-includes', '/wp-content/plugins', '/wp-config'])
PROBE_ENDS = anyof(P, 'ends_with', ['.php', '.sql', '.bak', '.old', '.zip', '.tar.gz', '.env', '.ini', '.log', '.asp', '.aspx', '.jsp', '.cgi'])
PROBE_STARTS = anyof(P, 'starts_with', ['/wp-admin', '/wp-login', '/wp-json', '/admin.', '/administrator', '/cms/', '/signin', '/login', '/register', '/api/auth'])
TOOLS = anyof(UA, 'contains', ['sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'nuclei', 'wpscan', 'acunetix', 'dirbuster', 'gobuster',
                               'nessus', 'openvas', 'whatweb', 'httpx', 'feroxbuster', 'ffuf', 'wfuzz', 'jaeles', 'xray/'])
R1 = (f'({PROBE_PATHS} or {PROBE_ENDS} or {PROBE_STARTS} or {TOOLS}'
      f' or (http.user_agent eq "" and not starts_with({P}, "/api/health"))'
      f' or (not http.request.method in {{"GET" "HEAD" "OPTIONS"}} and not starts_with({P}, "/cdn-cgi/")))')

CRAWLERS = ['applebot', 'ahrefsbot', 'semrushbot', 'mj12bot', 'dataforseobot', 'youbot', 'qlyzebot', 'exasearchbot', 'amazonbot',
            'amzn-searchbot', 'reflectionbot', 'petalbot', 'dotbot', 'blexbot', 'serpstatbot', 'barkrowler', 'gptbot', 'claudebot',
            'anthropic-ai', 'claude-searchbot', 'ccbot', 'bytespider', 'meta-externalagent', 'meta-externalfetcher', 'imagesiftbot',
            'diffbot', 'timpibot', 'omgili', 'cohere-ai', 'ai2bot', 'panscient', 'img2dataset', 'aionbot', 'kakaobot', 'baiduspider',
            'sogou', 'yandexbot', 'geedoshopproductfinder', 'dragonfly/', 'jscrawler', 'megaindex', 'linkfluence', 'seranking',
            'zoominfobot', 'iboubot', 'spiderling', 'tokenfoundry', 'scrapy']  # HeadlessChrome stays: own screenshot/QA scripts on Malina
SCANNER_IPS = '136.107.163.51 34.19.237.189 34.19.223.206 34.19.207.120 34.21.124.229 34.91.32.142 52.139.34.95 45.148.10.246 45.148.10.201 45.148.10.12 45.148.10.80'
R2 = (f'({anyof(UA, "contains", CRAWLERS)}'
      f' or ip.src in {{{SCANNER_IPS}}} or ip.src.asnum in {{48090}}'
      ' or (cf.client.bot and not cf.verified_bot_category in {"Search Engine Crawler" "Page Preview"})'
      f' or (not cf.client.bot and ({UA} contains "bot" or {UA} contains "crawl" or {UA} contains "spider")))')
# Free has no regex: Chrome 20–99 by its first digit, 10–19 with the dot (Chrome 100–139 = real users, never matched)
OLD_CHROME = ['Chrome/2', 'Chrome/3', 'Chrome/4', 'Chrome/5', 'Chrome/6', 'Chrome/7', 'Chrome/8', 'Chrome/9'] + [f'Chrome/1{i}.' for i in range(10)]
SCRIPTS = ['python-requests', 'python-urllib', 'go-http-client', 'libwww-perl', 'aiohttp', 'httpclient', 'okhttp', 'java/', 'wget/',
           'node-fetch', 'axios/', 'guzzlehttp', 'restsharp', 'postmanruntime']
# cloud / datacenter networks: real visitors come from Slovak and Czech ISPs, not from these
DC_ASN = '8075 16509 14618 14061 16276 24940 51167 9009 60068 212238 203020 45102 132203 136907 396982 63949 20473 4134 4837 23724'
SPAM_PATHS = ('(' + f'{P} in {{"/cart" "/checkout" "/init.php" "/php_version.php" "/version.php"}} or '
              + ' or '.join(f'starts_with({P}, "{p}")' for p in ['/products/', '/collections/', '/Catalog/', '/property-search/', '/support/solutions/']) + ')')
R4 = (f'(({anyof(UA, "contains", SCRIPTS)} or ip.src.asnum in {{{DC_ASN}}} or {SPAM_PATHS}'
      f' or {anyof("http.user_agent", "contains", OLD_CHROME + ["Firefox/4", "Firefox/3", "Firefox/2", "MSIE ", "Trident/"])})'
      f' and not cf.client.bot and not starts_with({P}, "/api/health") and not {P} eq "/robots.txt" and not starts_with({P}, "/sitemap")'
      f' and not ends_with({P}, ".xml") and not ends_with({P}, "{C["INDEXNOW_KEY"]}.txt"))')

d = f'/home/kenny/ai/backups/kuzelnemiesta-cf-zone-{datetime.date.today().isoformat()}'
os.makedirs(d, exist_ok=True)
waf = api('GET', '/rulesets/phases/http_request_firewall_custom/entrypoint')['result']
rl = api('GET', '/rulesets/phases/http_ratelimit/entrypoint').get('result') or {}
json.dump(waf, open(f'{d}/waf-custom.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rl, open(f'{d}/ratelimit.json', 'w'), ensure_ascii=False, indent=1)
print('backup:', d)

eu = next(r for r in waf['rules'] if 'x-malina-warm' in r['expression'])
rules = [
    {'action': 'block', 'description': 'Blok: sondy, útočné nástroje, prázdný UA, nepoužívané metody', 'expression': R1, 'enabled': True},
    {'action': 'block', 'description': 'Blok: nechtění crawleři (SEO/AI/scrapery), neověření boti, skenery, AS48090', 'expression': R2, 'enabled': True},
    {k: eu[k] for k in ('action', 'expression', 'description', 'enabled') if k in eu},
    {'action': 'managed_challenge', 'description': 'Challenge: skriptoví klienti, datacentra, spam cesty, staré prohlížeče', 'expression': R4, 'enabled': True},
]
for r in rules:
    print(f"{len(r['expression']):5} znaků | {r['action']:17} | {r['description']}")
    assert len(r['expression']) <= 4096, r['description']
# (query fields need Advanced Rate Limiting — search ?s= is limited by the Worker's RL_SEARCH binding instead)
limit = {'action': 'block', 'description': 'Rate limit /go/ + /api/ (20 req / 10 s na IP)',
         'expression': f'(starts_with({P}, "/go/") or starts_with({P}, "/api/"))',
         'ratelimit': {'characteristics': ['ip.src', 'cf.colo.id'], 'period': 10, 'requests_per_period': 20, 'mitigation_timeout': 10},
         'enabled': True}
if DRY:
    print(R4[:600])
    sys.exit('dry run — nothing changed')
api('PUT', f"/rulesets/{waf['id']}", {'rules': rules})
if rl.get('id'):
    api('PUT', f"/rulesets/{rl['id']}", {'rules': [limit]})
else:
    api('PUT', '/rulesets/phases/http_ratelimit/entrypoint', {'rules': [limit]})
print('WAF + rate limit updated')
