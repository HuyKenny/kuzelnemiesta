#!/usr/bin/env python3
"""Excursia.cz (CK Excursia, poznávací zájezdy): the feed URL lives only in kakapo's Worker secrets, so the ~35 tour pages are read
from the sitemap (title, text, photos, "od X Kč za osobu") and POSTed to the import Worker (/ingest/excursia).
Tracking: AffiliatePort/Scaleo click?o=1919&a=5453&deep_link=<url> (same as kakapo).

    python3 scripts/excursia-import.py <staging|production>
"""
import html, json, re, sys, time, urllib.parse, urllib.request
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
BASE = 'https://www.excursia.cz'
UA = 'KouzelnyDedaBot/1.0 (+https://kouzelnydeda.cz; affiliate partner catalogue)'
def get(u):
    for i in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=40).read().decode('utf8', 'replace')
        except Exception: time.sleep(1.5 * (i + 1))
    return ''
def clean(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
urls = [u for u in re.findall(r'<loc>([^<]+)</loc>', get(BASE + '/sitemap.xml')) if u.startswith(BASE + '/zazitky/') and u.count('/') == 5]
print(len(urls), 'tour pages')
items = []
for u in urls:
    time.sleep(0.4)
    s = get(u)
    og = lambda k: html.unescape((re.search(r'<meta property="og:%s" content="([^"]*)"' % k, s) or [None, ''])[1])
    txt = clean(re.sub(r'<(script|style|noscript)[\s\S]*?</\1>', ' ', s))
    prices = [int(re.sub(r'\D', '', m)) for m in re.findall(r'od\s+([\d  ]{4,9})\s*Kč za osobu', txt)]
    title = re.sub(r'\s*\|\s*CK Excursia$', '', og('title')).strip()
    if not prices or not title: continue
    i = txt.find('poznávací zájezd ')
    body = txt[i + 17:i + 17 + 2600] if i >= 0 else ''
    for stop in (' Recenze', ' Praktické informace', ' Fotogalerie'):
        k = body.find(stop, 300)
        if k > 0: body = body[:k]
    body = re.sub(r'(?<=[.!?]) ', '\n', body.strip())
    imgs, seen = [], set()
    for m in [og('image')] + re.findall(r'(/fotky/(?:original|detail-velky|velky)/[^"\'\s)]+\.jpe?g)', s):
        full = m if m.startswith('http') else BASE + m
        key = full.rsplit('/', 1)[-1].lower()
        if key not in seen: seen.add(key); imgs.append(urllib.parse.quote(full, safe=':/%'))
    meal = re.search(r'Strava:\s*([^:]{3,40}?)\s+Ubytování', txt)
    level = re.search(r'Náročnost:\s*(\w+)', txt)
    country = u.split('/')[4].replace('-', ' ').title()
    info = {'d': body or og('description'), 'h': og('description') or None, 'bo': meal.group(1).strip() if meal else None, 'tags': [country]}
    if level: info['pa'] = [['Náročnost', level.group(1)]]
    slug = u.rstrip('/').split('/')[-1]
    items.append({'ext': slug, 'name': title, 'target': 'https://tracking.affiliateport.eu/click?o=1919&a=5453&deep_link=' + urllib.parse.quote(u, safe=''),
                  'image': imgs[0] if imgs else '', 'images': imgs[1:7], 'price': min(prices), 'excerpt': og('description')[:300], 'info': {k: v for k, v in info.items() if v}})
print(len(items), 'tours scraped')
if len(items) < 15: sys.exit('too few tours — page layout changed?')
creds = {}
for line in open('/home/kenny/ai/credentials/.kouzelnydeda-credentials.env'):
    if '=' in line and not line.startswith('#'): k, v = line.strip().split('=', 1); creds[k] = v.strip('"\'')
host = 'kouzelnydeda-import-staging.huy-kenny.workers.dev' if env == 'staging' else 'kouzelnydeda-import.huy-kenny.workers.dev'
req = urllib.request.Request(f'https://{host}/ingest/excursia?force=1', data=json.dumps(items).encode(), method='POST',
                             headers={'Authorization': 'Bearer ' + creds['IMPORT_SHARED_SECRET_' + env.upper()], 'Content-Type': 'application/json', 'User-Agent': 'kd-ingest/1.0'})
print(urllib.request.urlopen(req, timeout=200).read().decode()[:300])
