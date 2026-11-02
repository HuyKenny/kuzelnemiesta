#!/usr/bin/env python3
"""Firmanazazitky.cz (CJ): reads the CJ Product Feed (GraphQL API, ~1 000 products with the official tracking links), adds the full text
from the product pages and POSTs the items to the import Worker (/ingest/firmanazazitky), which classifies them and applies them like a feed run.

    python3 scripts/firmanazazitky-import.py <staging|production> [--limit N]
Run daily from cron (bin/kouzelnydeda-firmanazazitky.sh). Be polite: 4 parallel requests, ~0.2 s apart.
"""
import html, json, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 0
BASE = 'https://www.firmanazazitky.cz'
CJ = 'https://www.jdoqocy.com/click-100738307-17346622'
UA = 'KouzelnyDedaBot/1.0 (+https://kouzelnydeda.cz; affiliate partner catalogue)'

def get(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40).read().decode('utf8', 'replace')
        except Exception:
            time.sleep(1.5 * (i + 1))
    return ''

def cj_token():
    for line in open('/home/kenny/ai/credentials/.kakapo-credentials.env'):
        if line.startswith('CJ_API_TOKEN='): return line.strip().split('=', 1)[1].strip('"\'')
    sys.exit('CJ_API_TOKEN missing')

def cj_products():
    """The CJ Product Feed (GraphQL, advertiser 7918457, our PID 100738307): price, link, photos, categories and the official tracking URL."""
    out, off = [], 0
    while True:
        q = ('{ shoppingProducts(companyId: "4867607", partnerIds: ["7918457"], limit: 1000, offset: %d) { totalCount count resultList { id title description price { amount } link imageLink '
             'additionalImageLink productType availability linkCode(pid: "100738307") { clickUrl } } } }' % off)
        r = urllib.request.urlopen(urllib.request.Request('https://ads.api.cj.com/query', data=json.dumps({'query': q}).encode(), method='POST',
                                   headers={'Authorization': 'Bearer ' + cj_token(), 'Content-Type': 'application/json'}), timeout=120)
        d = json.loads(r.read())['data']['shoppingProducts']
        out += d['resultList']; off += d['count']
        if not d['count'] or off >= d['totalCount']: return out

products = cj_products()
if limit: products = products[:limit]
print(len(products), 'products from CJ')

def clean(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def scrape(pr):
    """CJ gives a 200-character teaser: the page adds the full text, the voucher validity and the term."""
    time.sleep(0.2)
    u = pr['link']
    page = get(u)
    txt = clean(re.sub(r'<(script|style|noscript|nav|header|footer)[\s\S]*?</\1>', ' ', page)) if page else ''
    i = txt.find('Na co se budete těšit')
    desc = txt[i + 22:i + 22 + 2600] if i >= 0 else ''
    for stop in (' Co se bude dít', ' Zobrazit všechna hodnocení', ' Podobné zážitky', ' Další zážitky', ' Často kladené'):
        k = desc.find(stop, 400)
        if k > 0: desc = desc[:k]
    lead = html.unescape(pr.get('description') or '').strip()
    desc = re.sub(r'(?<=[.!?]) ', '\n', (desc or lead).strip())
    valid = re.search(r'Platnost poukazu do (\d{1,2})\.(\d{1,2})\.(\d{4})', txt)
    meta = re.search(r'(Celoročně|Sezónně)[^.]*\.[^A-Z]*', txt)
    price = float(pr['price']['amount'] or 0)
    click = (pr.get('linkCode') or {}).get('clickUrl') or ''
    if not click or price <= 0 or not pr.get('title'): return None
    imgs, seen = [], set()
    for m in [pr.get('imageLink')] + (pr.get('additionalImageLink') or []):
        if not m: continue
        base = re.sub(r'_\d+x\d+(?=\.\w+$)', '', m.rsplit('.', 1)[0]).lower()
        if base not in seen: seen.add(base); imgs.append(urllib.parse.quote(m, safe=':/%'))
    info = {'d': desc or lead, 'h': lead or None}
    if valid: info['ve'] = '%s-%02d-%02d' % (valid[3], int(valid[2]), int(valid[1]))
    if meta: info['pa'] = [['Termín a rozsah', meta.group(0).strip(' .')]]
    types = pr.get('productType') or []
    return {'ext': u.rstrip('/').split('/')[-1], 'name': pr['title'].strip(), 'target': click, 'image': imgs[0] if imgs else '', 'images': imgs[1:7], 'price': price,
            'excerpt': lead[:300], 'catText': f"{pr['title']} {' '.join(types)} {lead}", 'info': {k: v for k, v in info.items() if v}}

with ThreadPoolExecutor(4) as ex: items = [x for x in ex.map(scrape, products) if x]
print(len(items), 'products scraped')
if len(items) < 50: sys.exit('too few products — page layout changed?')
creds = {}
for line in open('/home/kenny/ai/credentials/.kouzelnydeda-credentials.env'):
    if '=' in line and not line.startswith('#'):
        k, v = line.strip().split('=', 1); creds[k] = v.strip('"\'')
host = 'kouzelnydeda-import-staging.huy-kenny.workers.dev' if env == 'staging' else 'kouzelnydeda-import.huy-kenny.workers.dev'
req = urllib.request.Request(f'https://{host}/ingest/firmanazazitky?force=1', data=json.dumps(items).encode(), method='POST',
                             headers={'Authorization': 'Bearer ' + creds['IMPORT_SHARED_SECRET_' + env.upper()], 'Content-Type': 'application/json', 'User-Agent': 'kd-ingest/1.0'})
print(urllib.request.urlopen(req, timeout=280).read().decode()[:300])
