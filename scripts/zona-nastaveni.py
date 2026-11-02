#!/usr/bin/env python3
"""Zone hardening of kuzelnemiesta.sk (3. 11. 2026) — idempotent, backup first.

    python3 scripts/zona-nastaveni.py [--dry]

* settings: min TLS 1.2, 0-RTT off, Always Online off, Email Obfuscation off (its script has no CSP nonce; the only
  address is in the legal pages), Early Hints stays off
* DNS: drop the proxied wildcard `*` (scanners → 521 at WEDOS) and the proxied `ftp` CNAME (FTP cannot pass the proxy);
  apex + www stay on the WEDOS origin so `cutover.py rollback` keeps working until WordPress is deleted
* TXT: SPF for WEDOS mail (MX is WEDOS), DMARC p=quarantine with reports to h@huy.cz
* DNSSEC on (the DS record has to be entered at WEDOS by hand: domain detail → DNSSEC → own keys; WAPI cannot do it
  for .sk) — DS values printed and saved to reports/kuzelnemiesta/dnssec-ds.md
Backup: backups/kuzelnemiesta-cf-zone-<date>/{settings,dns}.json
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
        sys.exit(f'{method} {path}: {e.code} {d.get("errors")}')


d = f'/home/kenny/ai/backups/kuzelnemiesta-cf-zone-{datetime.date.today().isoformat()}'
os.makedirs(d, exist_ok=True)
settings = api('GET', '/settings')['result']
dns = api('GET', '/dns_records?per_page=200')['result']
json.dump(settings, open(f'{d}/settings.json', 'w'), indent=1)
json.dump(dns, open(f'{d}/dns.json', 'w'), indent=1)
print('backup:', d)

WANT = {'min_tls_version': '1.2', '0rtt': 'off', 'always_online': 'off', 'email_obfuscation': 'off', 'early_hints': 'off'}
cur = {s['id']: s['value'] for s in settings}
for k, v in WANT.items():
    if cur.get(k) != v:
        print(f'setting {k}: {cur.get(k)} → {v}')
        if not DRY:
            api('PATCH', f'/settings/{k}', {'value': v})

for r in dns:
    if r['name'] in ('*.kuzelnemiesta.sk', 'ftp.kuzelnemiesta.sk'):
        print('delete DNS', r['type'], r['name'], '→', r['content'])
        if not DRY:
            api('DELETE', f"/dns_records/{r['id']}")

TXT = {
    'kuzelnemiesta.sk': 'v=spf1 include:_spf.wedos.com ~all',
    '_dmarc.kuzelnemiesta.sk': 'v=DMARC1; p=quarantine; rua=mailto:h@huy.cz; adkim=r; aspf=r',
}
have = {(r['name'], r['content'].strip('"')) for r in dns if r['type'] == 'TXT'}
for name, val in TXT.items():
    if any(n == name and c.split(';')[0].split(' ')[0] == val.split(';')[0].split(' ')[0] for n, c in have):
        print('TXT exists', name)
        continue
    print('add TXT', name, val)
    if not DRY:
        api('POST', '/dns_records', {'type': 'TXT', 'name': name, 'content': f'"{val}"', 'ttl': 3600})

sec = api('GET', '/dnssec')['result']
if sec.get('status') in ('disabled', None) and not DRY:
    sec = api('PATCH', '/dnssec', {'status': 'active'})['result']
print('DNSSEC:', sec.get('status'))
if sec.get('ds'):
    os.makedirs('/home/kenny/ai/reports/kuzelnemiesta', exist_ok=True)
    md = (f"# kuzelnemiesta.sk — DNSSEC DS ({datetime.date.today()})\n\nZadat u WEDOS: detail domény → Nastavení DNSSEC → vlastní klíče.\n\n"
          f"- Key tag: {sec.get('key_tag')}\n- Algorithm: {sec.get('algorithm')}\n- Digest type: {sec.get('digest_type')}\n- Digest: {sec.get('digest')}\n"
          f"- DS: `{sec.get('ds')}`\n- DNSKEY (public key): `{sec.get('public_key')}`\n")
    open('/home/kenny/ai/reports/kuzelnemiesta/dnssec-ds.md', 'w').write(md)
    print('DS saved to reports/kuzelnemiesta/dnssec-ds.md')
