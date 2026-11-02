#!/usr/bin/env python3
"""Weekly Search Console report of kouzelnydeda.cz → reports/kouzelnydeda/gsc-tyden-<date>.md (clicks/impressions, trend, top queries,
page-2 opportunities, milestone check). Run from bin/kouzelnydeda-firmanazazitky.sh on Sundays. Service account = bin/gsc-hlidac.py's."""
import datetime as dt, json, time, urllib.parse, urllib.request
from pathlib import Path
import jwt

KEY = Path('/home/kenny/.config/gsc/service-account.json')
OUT = Path('/home/kenny/ai/reports/kouzelnydeda'); OUT.mkdir(parents=True, exist_ok=True)
MILESTONES = [('2026-11-15', 25), ('2026-12-31', 60), ('2027-02-28', 150)]  # organic clicks per day

d = json.loads(KEY.read_text()); now = int(time.time())
a = jwt.encode({'iss': d['client_email'], 'scope': 'https://www.googleapis.com/auth/webmasters.readonly', 'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3600}, d['private_key'], algorithm='RS256')
tok = json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': a}).encode()), timeout=30))['access_token']
H = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
site = 'sc-domain:kouzelnydeda.cz'
sites = [s['siteUrl'] for s in json.load(urllib.request.urlopen(urllib.request.Request('https://www.googleapis.com/webmasters/v3/sites', headers=H), timeout=30)).get('siteEntry', []) if 'kouzelnydeda' in s['siteUrl']]
site = site if site in sites else sites[0]
S = urllib.parse.quote(site, safe='')

def q(start, end, dims, lim=1000):
    body = json.dumps({'startDate': str(start), 'endDate': str(end), 'dimensions': dims, 'rowLimit': lim}).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(f'https://www.googleapis.com/webmasters/v3/sites/{S}/searchAnalytics/query', body, H), timeout=120)).get('rows', [])

end = dt.date.today() - dt.timedelta(days=3)  # GSC lags ~2 days
w1 = (end - dt.timedelta(days=6), end); w0 = (end - dt.timedelta(days=13), end - dt.timedelta(days=7))
def tot(w):
    r = q(*w, ['date']); return sum(x['clicks'] for x in r), sum(x['impressions'] for x in r)
c1, i1 = tot(w1); c0, i0 = tot(w0)
qs = q(*w1, ['query'], 2000)
pg = q(*w1, ['page'], 2000)
L = [f'# kouzelnydeda.cz – Search Console, týden {w1[0]} až {w1[1]}', '',
     f'- Kliky: **{int(c1)}** ({c1 / 7:.1f}/den), předchozí týden {int(c0)} ({(c1 - c0) / max(c0, 1) * 100:+.0f} %)',
     f'- Zobrazení: **{int(i1)}**, předchozí týden {int(i0)} ({(i1 - i0) / max(i0, 1) * 100:+.0f} %)']
for day, goal in MILESTONES:
    L.append(f'- Milník {day}: {goal} kliků/den, dnes {c1 / 7:.1f}')
L += ['', '## Top dotazy podle kliků', '| dotaz | kliky | zobr. | pozice |', '|---|---|---|---|']
for x in sorted(qs, key=lambda x: -x['clicks'])[:15]: L.append(f"| {x['keys'][0]} | {int(x['clicks'])} | {int(x['impressions'])} | {x['position']:.1f} |")
L += ['', '## Příležitosti: pozice 4–20, nejvíc zobrazení', '| dotaz | zobr. | kliky | pozice |', '|---|---|---|---|']
for x in sorted([x for x in qs if 4 <= x['position'] <= 20], key=lambda x: -x['impressions'])[:25]: L.append(f"| {x['keys'][0]} | {int(x['impressions'])} | {int(x['clicks'])} | {x['position']:.1f} |")
L += ['', '## Top stránky podle zobrazení', '| stránka | zobr. | kliky | pozice |', '|---|---|---|---|']
for x in sorted(pg, key=lambda x: -x['impressions'])[:15]: L.append(f"| {x['keys'][0].replace('https://kouzelnydeda.cz', '')} | {int(x['impressions'])} | {int(x['clicks'])} | {x['position']:.1f} |")
# tracked head keywords: position and impressions this week (exact query match, GSC normalises case)
TRACKED = ['zážitky', 'zážitkové dárky', 'dárek pro muže', 'dárek pro ženu', 'wellness pobyt pro dva', 'zájezdy na fotbal', 'vstupenky na fotbal', 'dárek pro kamarádku', 'pivní lázně', 'privátní wellness']
L += ['', '## Sledovaná klíčová slova', '| dotaz | pozice | zobr. | kliky | stránka |', '|---|---|---|---|---|']
byq = {x['keys'][0]: x for x in qs}
tp = {}
for x in q(*w1, ['query', 'page'], 5000):
    if x['keys'][0] in TRACKED and (x['keys'][0] not in tp or x['impressions'] > tp[x['keys'][0]]['impressions']): tp[x['keys'][0]] = x
for kw in TRACKED:
    x = byq.get(kw)
    L.append(f"| {kw} | {x['position']:.1f} | {int(x['impressions'])} | {int(x['clicks'])} | {tp[kw]['keys'][1].replace('https://kouzelnydeda.cz', '') if kw in tp else ''} |" if x else f'| {kw} | nezobrazuje se | 0 | 0 | |')
f = OUT / f'gsc-tyden-{end}.md'; f.write_text('\n'.join(L) + '\n'); print(f)
