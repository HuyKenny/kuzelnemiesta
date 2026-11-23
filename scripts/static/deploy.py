#!/usr/bin/env python3
"""Deploy the frozen site to the SAME Workers as before: <worker> (zone route <domain>/*) + prefix shards <worker>-zNN.

Workers Free allows 20 000 files per Worker version, so the site is split by URL-path prefix (zmraz.plan_shards). The plan is
sticky (data/shards.json, first run: read from the live zone routes): new files go to the shard whose prefix they match, and
the shards are re-planned only when one would overflow. That keeps the zone routes stable from night to night.

Order: upload every shard + main (assets only, no routes in the wrangler config, so wrangler never touches routes), then sync
the zone routes of the shards (create / re-point / delete), then delete shard Workers that left the plan.
Auth: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) in CI — Workers Scripts Write (account), Workers Routes Write + Zone Read
(the site's zone); on Malina the global key from credentials/ (zmraz.cf_creds).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import zmraz  # noqa: E402

CAP = zmraz.SHARD_CAP


def api(path, method='GET', body=None):
    h = dict(zmraz.cf_creds()[0], **{'User-Agent': 'shop-static/1.0', 'Content-Type': 'application/json'})
    r = urllib.request.Request('https://api.cloudflare.com/client/v4' + path, headers=h, method=method,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        return json.load(urllib.request.urlopen(r, timeout=60))
    except urllib.error.HTTPError as e:
        return json.load(e)


def zone_routes(zone_id):
    out, page = [], 1
    while True:
        r = api(f'/zones/{zone_id}/workers/routes?page={page}&per_page=100')
        if not r.get('success'):
            sys.exit(f'zone routes: {r.get("errors")}')
        out += r['result']
        info = r.get('result_info') or {}
        if not info or page >= info.get('total_pages', 1) or not r['result']:
            return out
        page += 1


def sticky_plan(files, prev):
    """prev: [{"name", "prefixes"}]. Returns (main, shards) or None when a Worker would overflow."""
    pre = sorted(((p, s['name']) for s in prev for p in s['prefixes']), key=lambda x: -len(x[0]))
    groups = {s['name']: [] for s in prev}
    main = []
    for f in files:
        u = zmraz.url_path(f)
        for p, name in pre:
            if u.startswith(p) and not u.startswith('/_'):
                groups[name].append(f)
                break
        else:
            main.append(f)
    if len(main) > CAP or any(len(g) > CAP for g in groups.values()):
        return None
    shards = [{'name': s['name'], 'prefixes': s['prefixes'], 'files': groups[s['name']]} for s in prev if groups[s['name']]]
    return main, shards


def deploy(site, out, plan_file, dry=False):
    out = Path(out).resolve()
    worker, domain = site['worker'], site['domain']
    acc = zmraz.account_id()
    z = api(f'/zones?name={site.get("zone", domain)}')['result']
    if not z:
        sys.exit('zone not visible to the token')
    zone_id = z[0]['id']
    routes = zone_routes(zone_id)
    shard_re = re.compile(re.escape(worker) + r'-z(\d\d)$')
    if not any(r.get('script') == worker for r in routes):
        sys.exit(f'Worker {worker} has no zone route — refusing to deploy blind')
    plan_file = Path(plan_file)
    if plan_file.exists():
        prev = json.loads(plan_file.read_text())['shards']
    else:   # first run: the plan the live site has now
        by = {}
        for r in routes:
            if shard_re.match(r.get('script') or '') and r['pattern'].startswith(domain + '/') and r['pattern'].endswith('*'):
                by.setdefault(r['script'], []).append(r['pattern'][len(domain):-1])
        prev = [{'name': k, 'prefixes': sorted(v)} for k, v in sorted(by.items())]
    files = [f for f in (p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file()) if f not in ('_redirects', '404.html')]
    plan = sticky_plan(files, prev)
    if plan is None:
        print('shard plan: re-planning (a Worker would exceed the file limit)', flush=True)
        main_files, packed = zmraz.plan_shards(out)
        shards = [{'name': f'{worker}-z{i:02d}', 'prefixes': s['prefixes'], 'files': s['files']} for i, s in enumerate(packed, 1)]
    else:
        main_files, shards = plan
    print(f'plan: main {len(main_files)} files, ' + ', '.join(f'{s["name"]} {len(s["files"])} ({len(s["prefixes"])} prefixes)' for s in shards), flush=True)
    if dry:
        return
    work = out.parent / (out.name + '-deploy')
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    nf = '404-page' if (out / '404.html').exists() else 'none'
    wr = os.environ.get('WRANGLER') or str(Path(site.get('app_dir', HERE.parent.parent)) / 'node_modules' / '.bin' / 'wrangler')
    env = dict(os.environ, **zmraz.cf_creds()[1], CLOUDFLARE_ACCOUNT_ID=acc, WRANGLER_SEND_METRICS='false', CI='1')
    for name, fl in [(s['name'], s['files']) for s in shards] + [(worker, main_files)]:
        d = work / name
        zmraz.materialize(out, d, fl)
        cfg = {'name': name, 'compatibility_date': '2026-11-01', 'workers_dev': False, 'preview_urls': False,
               'assets': {'directory': str(d), 'html_handling': 'auto-trailing-slash', 'not_found_handling': nf}}
        cp = work / f'wrangler-{name}.json'
        cp.write_text(json.dumps(cfg))
        res = subprocess.run([wr, 'deploy', '-c', str(cp)], cwd=str(work), env=env, capture_output=True, text=True)
        full = res.stdout + res.stderr
        up = re.search(r'Uploaded \d+ files?(?: \([^)]*\))?', full) or re.search(r'No (?:updated )?asset files to upload', full)
        if res.returncode != 0 or 'Current Version ID' not in full:
            print(re.sub(r'(?i)(token|key)[^\n]*', '[redacted]', full[-1500:]))
            sys.exit(f'deploy {name} failed')
        print(f'{name}: {len(fl)} files, {up.group(0) if up else "uploaded"}', flush=True)
        shutil.rmtree(d)
    # zone routes of the shards
    want = {f'{domain}{p}*': s['name'] for s in shards for p in s['prefixes']}
    have = {r['pattern']: r for r in routes}
    made = moved = gone = 0
    for pat, name in want.items():
        r = have.get(pat)
        if r and r.get('script') == name:
            continue
        if r:
            res = api(f'/zones/{zone_id}/workers/routes/{r["id"]}', 'PUT', {'pattern': pat, 'script': name})
            moved += 1
        else:
            res = api(f'/zones/{zone_id}/workers/routes', 'POST', {'pattern': pat, 'script': name})
            made += 1
        if not res.get('success'):
            sys.exit(f'route {pat}: {res.get("errors")}')
    for r in routes:
        if shard_re.match(r.get('script') or '') and r['pattern'] not in want:
            res = api(f'/zones/{zone_id}/workers/routes/{r["id"]}', 'DELETE')
            gone += 1
            if not res.get('success'):
                print(f'route {r["pattern"]} not deleted: {res.get("errors")}')
    print(f'routes: {made} new, {moved} re-pointed, {gone} deleted', flush=True)
    keep = {s['name'] for s in shards}
    for sc in api(f'/accounts/{acc}/workers/scripts').get('result') or []:
        if shard_re.match(sc['id']) and sc['id'] not in keep:
            r = api(f'/accounts/{acc}/workers/scripts/{sc["id"]}?force=true', 'DELETE')
            print(f'old shard {sc["id"]} deleted' if r.get('success') else f'old shard {sc["id"]}: {r.get("errors")}')
    plan_file.parent.mkdir(parents=True, exist_ok=True)
    plan_file.write_text(json.dumps({'shards': [{'name': s['name'], 'prefixes': s['prefixes']} for s in shards]}, indent=1))
    shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    site = json.loads((HERE / 'site.json').read_text())
    deploy(site, a.out, HERE.parent.parent / 'data' / 'shards.json', dry=a.dry)
