#!/usr/bin/env python3
"""Featured images of blog posts from Pexels → public/wp-content/uploads/2026/11/ (1200×675 + 768×432 webp) + D1 posts.image*.

    python3 scripts/pexels-clanky.py <staging|production> [--dry]     (production needs KD_PRODUCTION_APPROVED=yes)
Key: PEXELS_API_KEY in credentials/.alkoholicky-credentials.env. The photographer is stored in image_alt's sibling (credit in alt text).
"""
import io, json, os, subprocess, sys, tempfile, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env not in ('staging', 'production') or (env == 'production' and os.environ.get('KD_PRODUCTION_APPROVED') != 'yes'):
    sys.exit(__doc__)
DRY = '--dry' in sys.argv
NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin'
C = {}
for f in ('.cloudflare-credentials.env', '.kuzelnemiesta-credentials.env', '.alkoholicky-credentials.env'):
    for line in open(f'/home/kenny/ai/credentials/{f}'):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1); C.setdefault(k, v.strip('"\''))
ENV = {**os.environ, 'PATH': f"{NODE}:{os.environ['PATH']}", 'CLOUDFLARE_EMAIL': C['CF_EMAIL'], 'CLOUDFLARE_API_KEY': C['CF_GLOBAL_API_KEY'], 'CLOUDFLARE_ACCOUNT_ID': C['CF_ACCOUNT_ID']}
def wr(args):
    r = subprocess.run([f'{NODE}/node', str(ROOT / 'node_modules/wrangler/bin/wrangler.js'), *args], cwd=ROOT, env=ENV, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])
    return r.stdout[r.stdout.index('['):] if '--json' in args else r.stdout
# post slug → Pexels query (English works best)
Q = {
 'tipy-na-vianocne-darceky-2026-zazitky': 'christmas gift wrapped presents', 'darcekovy-poukaz-vzor-na-stiahnutie': 'gift voucher envelope ribbon',
 'kam-na-silvester-2026-na-slovensku': 'new year eve fireworks mountains', 'kupele-na-slovensku-prehlad-kupelnych-miest': 'thermal spa pool relax',
 'husacie-hody-2026-kam-na-martinske-hody': 'roast duck dinner table', 'escape-room-bratislava-ako-vybrat': 'escape room puzzle friends',
 'let-balonom-cena-kde-a-kedy-lietat': 'hot air balloon sunrise', 'kam-na-vikend-pre-dvoch-na-slovensku': 'couple weekend getaway mountains cabin',
 'rekreacne-poukazy-a-senior-pobyty-so-statnou-dotaciou': 'senior couple travel relax', 'darcek-pre-muza-ktory-ma-vsetko-25-zazitkov': 'man adventure driving experience',
 'zazitkove-darceky-darcekove-poukazy': 'gift box experience present', 'wellness-pobyty-pre-dvoch-ako-vybrat': 'couple spa wellness',
 'albansko-europsky-karibik-za-polovicne-ceny-kam-ist-a-kde-sa-ubytovat': 'albania beach turquoise sea',
}
key = C['PEXELS_API_KEY']
posts = json.loads(wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--json', '--command', "SELECT id, slug, title FROM posts WHERE type='post' AND status='publish' AND image = ''"]))[0]['results']
out = ROOT / 'public/wp-content/uploads/2026/11'; out.mkdir(parents=True, exist_ok=True)
stmts, used = [], set()
for p in posts:
    q = Q.get(p['slug'])
    if not q: print('no query for', p['slug']); continue
    req = urllib.request.Request('https://api.pexels.com/v1/search?' + urllib.parse.urlencode({'query': q, 'orientation': 'landscape', 'per_page': 15, 'size': 'large'}), headers={'Authorization': key, 'User-Agent': 'kuzelnemiesta/1.0'})
    res = json.load(urllib.request.urlopen(req, timeout=60)).get('photos', [])
    pick = next((x for x in res if x['id'] not in used and x['width'] >= 1600), None)
    if not pick: print('no photo for', p['slug']); continue
    used.add(pick['id'])
    img = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(pick['src']['large2x'], headers={'User-Agent': 'kuzelnemiesta/1.0'}), timeout=90).read())).convert('RGB')
    def crop(w, h):
        r = max(w / img.width, h / img.height); i = img.resize((round(img.width * r) + 1, round(img.height * r) + 1), Image.LANCZOS)
        l, t = (i.width - w) // 2, (i.height - h) // 2; return i.crop((l, t, l + w, t + h))
    base = f"{p['slug'][:60]}-{pick['id']}"
    big, card = f'{base}.webp', f'{base}-768x432.webp'
    print(p['slug'][:50], '←', pick['id'], pick['photographer'])
    if DRY: continue
    crop(1200, 675).save(out / big, 'WEBP', quality=82, method=6); crop(768, 432).save(out / card, 'WEBP', quality=80, method=6)
    alt = f"{p['title']} – foto: {pick['photographer']} / Pexels".replace("'", "''")
    stmts.append(f"UPDATE posts SET image = '/wp-content/uploads/2026/11/{big}', image_card = '/wp-content/uploads/2026/11/{card}', image_alt = '{alt}', image_w = 1200, image_h = 675 WHERE id = {p['id']};")
if stmts:
    stmts.append("INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', CAST(strftime('%s','now') AS TEXT), datetime('now'));")
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as t: t.write('\n'.join(stmts) + '\n')
    wr(['d1', 'execute', 'DB', '--env', env, '--remote', '--yes', '--file', t.name])
    print('D1 updated', len(stmts) - 1)
