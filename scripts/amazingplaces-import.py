#!/usr/bin/env python3
"""Amazing Places (amazingplaces.cz, Post Affiliate Pro ?a_box=&a_cam=): no feed → the ~660 place pages of the Czech sitemap
(/cs/kouzelna-mista/<slug>) are read (title, text, photos, "Od X Kč za noc", benefits, place) and POSTed to /ingest/amazingplaces.
Pages are ~1 MB each, so run it weekly (bin/kouzelnydeda-firmanazazitky.sh does on Sundays).

    python3 scripts/amazingplaces-import.py <staging|production> [--limit N]
"""
import html, json, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 0
BASE = 'https://www.amazingplaces.cz'
UA = 'KouzelnyDedaBot/1.0 (+https://kouzelnydeda.cz; affiliate partner catalogue)'
CC = {'Česko': 'CZE', 'Slovensko': 'SVK', 'Rakousko': 'AUT', 'Itálie': 'ITA', 'Polsko': 'POL', 'Německo': 'DEU', 'Maďarsko': 'HUN', 'Chorvatsko': 'HRV', 'Slovinsko': 'SVN'}
def get(u):
    for i in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=60).read().decode('utf8', 'replace')
        except Exception: time.sleep(2 * (i + 1))
    return ''
def clean(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
urls = [u for u in re.findall(r'<loc>([^<]+)</loc>', get(BASE + '/sitemap.xml')) if '/cs/kouzelna-mista/' in u]
if limit: urls = urls[:limit]
print(len(urls), 'places')

def scrape(u):
    time.sleep(0.3)
    s = get(u)
    if not s: return None
    meta = lambda k: html.unescape((re.search(r'(?:name|property)="%s" content="([^"]*)"' % k, s) or [None, ''])[1])
    title = re.sub(r'\s*-\s*kouzelné místo.*$', '', meta('og:title')).strip()
    body = re.sub(r'<(script|style|noscript)[\s\S]*?</\1>', ' ', s)
    txt = clean(body)
    pr = re.search(r'Od\s+([\d\s ]{3,8})\s*Kč za noc', txt)
    if not title or not pr: return None
    price = int(re.sub(r'\D', '', pr.group(1)))
    tp = re.search(r'(Boutique Hotel|Malý penzion|Penzion Upper Class|Upper Class|Hotel|Apartmán|Chalupa|Roubenka|Glamping|Penzion|Vila|Hausbót|Vinařství|Kavárna) • ([^,•]{2,40}), ([A-Za-zÀ-ž]{4,12})', txt)
    kind, place, country = (tp.group(1).strip(), tp.group(2).strip(), tp.group(3)) if tp else ('', '', 'Česko')
    desc = html.unescape(meta('description'))
    a, b = pr.end(), txt.find('Další benefity')
    full = txt[a:b] if 0 < a < b else ''
    full = re.sub(r'\bTip Místo přijímá dárkové vouchery Koupit\b|\bČíst více\b', ' ', full)
    full = re.sub(r'\s+', ' ', full).strip()
    if len(full) > len(desc): desc = full
    imgs, seen = [], set()
    for m in [meta('og:image')] + ['https://' + x for x in re.findall(r'files\.better-hotel\.com/worker0*1/(?:medium/)?[^"\'\s)&?]+\.jpe?g', s)]:
        full = 'https:' + m if m.startswith('//') else m
        key = full.rsplit('/', 1)[-1].lower()
        if key not in seen: seen.add(key); imgs.append(full)
    nodes = [html.unescape(t).strip() for t in re.findall(r'>([^<>]+)<', body) if t.strip()]
    ap = []
    if 'Další benefity' in nodes:
        k = nodes.index('Další benefity')
        for t in nodes[k + 1:k + 14]:
            if t.startswith('Další fotky') or t == 'Další fotky': break
            if 2 < len(t) < 40 and not t.startswith('Přijímáme vouchery') and t not in ap: ap.append(t)
    slug = u.rstrip('/').split('/')[-1]
    info = {'d': desc, 'h': desc.split('. ')[0], 'pv': {'t': title, 'a': f'{place}, {country}'}, 'cc': CC.get(country, 'CZE'), 'ap': ap[:20],
            'pa': [['Cena', f'od {price:,} Kč za noc'.replace(',', ' ')]] + ([['Typ ubytování', kind]] if kind else []), 'tags': [kind] if kind else []}
    return {'ext': slug, 'name': title, 'target': f'{BASE}/cs/kouzelna-mista/{slug}?a_box=33bnvjub&a_cam=9', 'image': imgs[0] if imgs else '', 'images': imgs[1:7], 'price': price,
            'lok': '', 'city': place, 'excerpt': desc[:300], 'catText': f'{title} {kind} {desc[:400]}', 'info': {k: v for k, v in info.items() if v}}

with ThreadPoolExecutor(4) as ex: items = [x for x in ex.map(scrape, urls) if x and x['image']]
print(len(items), 'places scraped')
if len(items) < 100: sys.exit('too few places — page layout changed?')
creds = {}
for line in open('/home/kenny/ai/credentials/.kouzelnydeda-credentials.env'):
    if '=' in line and not line.startswith('#'): k, v = line.strip().split('=', 1); creds[k] = v.strip('"\'')
host = 'kouzelnydeda-import-staging.huy-kenny.workers.dev' if env == 'staging' else 'kouzelnydeda-import.huy-kenny.workers.dev'
req = urllib.request.Request(f'https://{host}/ingest/amazingplaces?force=1', data=json.dumps(items).encode(), method='POST',
                             headers={'Authorization': 'Bearer ' + creds['IMPORT_SHARED_SECRET_' + env.upper()], 'Content-Type': 'application/json', 'User-Agent': 'kd-ingest/1.0'})
print(urllib.request.urlopen(req, timeout=250).read().decode()[:300])
