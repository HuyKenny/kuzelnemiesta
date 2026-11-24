#!/usr/bin/env python3
"""Nightly static build of a shop-template site (Cloudflare Workers Free, 2026-11).

Shared by kakapo, alkoholicky, kouzelnydeda, kuzelnemiesta and eroka (master copy: ~/ai/scripts/cloudflare-free/shop-static/,
site specifics in scripts/static/site.json). One run (GitHub Actions, .github/workflows/static.yml):
  1. data/state.db (SQLite with the D1 schema, restored by scripts/static/state.sh) is copied into the local D1 of
     `wrangler dev --local` and pending migrations are applied,
  2. full mode: the site's import commands (site.json "import") run over that file (the code of the deleted import Worker),
  3. the SSR app (dist/, built with CLOUDFLARE_ENV=render) runs under `wrangler dev --local`; zmraz.py crawls it into
     .static-work/out (production URLs, sitemap pages + assets), plus every file of dist/client,
  4. /go/ (and kakapo /akce/) exits are written straight from the SQLite file (go_exits.py),
  5. a size guard compares with the previous run, deploy.py uploads the changed files to the same Workers (<worker> +
     prefix shards <worker>-zNN, zone routes kept in sync), the state is copied back to data/state.db,
  6. smoke test of the live site (a WAF challenge from a datacenter IP counts as "not checked", not as a failure).

    build.py run [--mode full|quick] [--no-deploy] [--limit N] [--keep]
      full   imports + render + deploy (nightly)
      quick  render + deploy from the saved state (CSS/JS/template/text fixes, no feed requests)
Prints counts and HTTP statuses only (public Actions logs).
"""
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
SITE = json.loads((HERE / 'site.json').read_text())
WORK = Path(os.environ.get('STATIC_WORK') or APP / '.static-work')
OUT = WORK / 'out'
PERSIST = WORK / 'wrangler-state'
DATA = APP / 'data'
STATE_DB = DATA / 'state.db'
META = DATA / 'static-meta.json'
DIST = APP / 'dist'
PORT = int(os.environ.get('STATIC_PORT') or SITE.get('port', 8811))
ORIGIN = f'http://127.0.0.1:{PORT}'
DOMAIN = SITE['domain']


def log(*a):
    print(*a, flush=True)


def group(name):
    if os.environ.get('GITHUB_ACTIONS'):
        print(f'::endgroup::\n::group::{name}', flush=True)
    log(f'== {name} ({time.strftime("%H:%M:%S")})')


def wrangler(*args, **kw):
    return subprocess.run(['pnpm', 'exec', 'wrangler', *args], cwd=APP, env={**os.environ, 'CI': '1', 'WRANGLER_SEND_METRICS': 'false'}, **kw)


def prepare_db():
    """data/state.db -> the local D1 file of dist/server/wrangler.json (+ pending migrations). Returns its path."""
    if PERSIST.exists():
        shutil.rmtree(PERSIST)
    cfg = str(DIST / 'server' / 'wrangler.json')
    args = ('d1', 'migrations', 'apply', SITE.get('db_binding', 'DB'), '--local', '-c', cfg, '--persist-to', str(PERSIST))
    r = wrangler(*args, capture_output=True, text=True)
    files = [f for f in (PERSIST / 'v3' / 'd1').rglob('*.sqlite') if f.name != 'metadata.sqlite']
    if r.returncode or len(files) != 1:
        log(r.stdout[-1500:], r.stderr[-1500:])
        sys.exit('could not create the local D1 file')
    target = files[0]
    if not STATE_DB.exists():
        sys.exit('no data/state.db: run scripts/static/state.sh pull (CI) or scripts/static/seed.py (first run)')
    for f in target.parent.glob(target.name + '*'):
        f.unlink()
    shutil.copyfile(STATE_DB, target)
    r = wrangler(*args, capture_output=True, text=True)
    if r.returncode:
        log(r.stdout[-1500:], r.stderr[-1500:])
        sys.exit('migrations failed on the restored state')
    applied = [l for l in r.stdout.splitlines() if '✅' in l]
    log(f'state: {STATE_DB.stat().st_size // 1_000_000} MB, {len(applied)} new migrations')
    return target


def run_imports(db):
    ok = True
    for cmd in SITE.get('import', []):
        argv = [x.replace('{db}', str(db)).replace('{inbox}', str(WORK / 'inbox')).replace('{work}', str(WORK)) for x in cmd]
        t = time.time()
        (WORK / 'reports').mkdir(parents=True, exist_ok=True)
        r = subprocess.run(argv, cwd=APP, env={**os.environ, 'STATIC_DB': str(db), 'STATIC_REPORTS': str(WORK / 'reports')})
        log(f'import step {argv[2] if len(argv) > 2 else argv[0]}: exit {r.returncode} in {time.time() - t:.0f} s')
        ok &= r.returncode == 0
    return ok


class Server:
    def __enter__(self):
        WORK.mkdir(parents=True, exist_ok=True)
        dv = DIST / 'server' / '.dev.vars'
        if dv.exists():
            dv.unlink()   # render env needs no secrets; never let a local .dev.vars switch the environment
        self.logf = open(WORK / 'wrangler-dev.log', 'w')
        self.proc = subprocess.Popen(['pnpm', 'exec', 'wrangler', 'dev', '-c', str(DIST / 'server' / 'wrangler.json'), '--local',
                                      '--persist-to', str(PERSIST), '--port', str(PORT), '--ip', '127.0.0.1',
                                      '--inspector-port', str(PORT + 1), '--show-interactive-dev-session=false', '--log-level', 'warn'],
                                     cwd=APP, stdout=self.logf, stderr=subprocess.STDOUT, start_new_session=True,
                                     env={**os.environ, 'CI': '1', 'WRANGLER_SEND_METRICS': 'false'})
        for _ in range(180):
            time.sleep(1)
            if self.proc.poll() is not None:
                break
            try:
                with urllib.request.urlopen(ORIGIN + '/robots.txt', timeout=30) as r:
                    if r.status == 200:
                        return self
            except Exception:
                pass
        self.stop()
        log((WORK / 'wrangler-dev.log').read_text()[-3000:])
        sys.exit('local SSR did not start')

    def stop(self):
        if self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(30)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
        self.logf.close()

    def __exit__(self, *a):
        self.stop()


def extra_paths(db, queries):
    """site.json crawl.extra_paths_sql: SQL over the local D1 file returning paths (1st column) to crawl besides the sitemap,
    e.g. offers that expired < 30 days ago: the SSR still rendered them (200), older ones 301 to their category.
    Without this the frozen site answered 404 for them (audit 24. 11. 2026: ~300 GSC URLs on kouzelnydeda/kuzelnemiesta)."""
    import sqlite3
    out = []
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    try:
        for q in queries:
            out += [r[0] for r in con.execute(q) if r and isinstance(r[0], str) and r[0].startswith('/')]
    finally:
        con.close()
    f = WORK / 'extra-paths.txt'
    f.write_text('\n'.join(dict.fromkeys(out)) + '\n', encoding='utf-8')
    log(f'extra paths: {len(out)}')
    return f


def crawl(limit, db=None):
    if OUT.exists():
        shutil.rmtree(OUT)
    c = SITE.get('crawl', {})
    argv = [sys.executable, '-u', str(HERE / 'zmraz.py'), 'crawl', DOMAIN, '--out', str(OUT), '--base', ORIGIN,
            '--workers', str(c.get('workers', 4)), '--extra-until', str(c.get('extra_until', 0)), '--exits', c.get('exits', '/go/')]
    if c.get('extra_paths_sql') and db:
        argv += ['--extra-paths', str(extra_paths(db, c['extra_paths_sql']))]
    if c.get('no_go', True):
        argv.append('--no-go')
    for s in c.get('skip', []):
        argv += ['--skip', s]
    # zmraz.py stops at 19 500 files by default (one Worker); here the deploy shards, so no cap unless testing
    argv += ['--limit', str(limit or 1_000_000)]
    r = subprocess.run(argv, cwd=APP)
    if r.returncode:
        sys.exit('crawl failed')
    meta = json.loads((WORK / 'out.meta.json').read_text())
    if meta.get('error_prefixes'):
        log('crawl errors by prefix:', json.dumps(meta['error_prefixes']))
    # every file of the client build (public/ + /_astro): the crawl only finds what pages reference
    n = 0
    client = DIST / 'client'
    for f in client.rglob('*'):
        rel = f.relative_to(client).as_posix()
        if f.is_dir() or rel in ('_worker.js', '_routes.json', '.assetsignore') or rel.startswith(('_worker.js/', '.')):
            continue
        d = OUT / rel
        if not d.exists():
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, d)
            n += 1
    meta['client_files_added'] = n
    return meta


def html_count():
    return sum(1 for p in OUT.rglob('*.html') if not p.relative_to(OUT).as_posix().startswith(('go/', 'akce/')))


def guard(meta, stats):
    """Refuse to deploy a build much smaller than the last one (broken import, empty table, render errors)."""
    prev = json.loads(META.read_text()) if META.exists() else {}
    floor = SITE.get('min_ratio', 0.85)
    bad = []
    for k in ('pages', 'exits'):
        if prev.get(k) and stats[k] < prev[k] * floor:
            bad.append(f'{k} {stats[k]} < {floor:.0%} of {prev[k]}')
    if stats['pages'] < SITE.get('min_pages', 100):
        bad.append(f'pages {stats["pages"]} < min {SITE.get("min_pages", 100)}')
    # page 404s/5xx mean broken rendering; dead images/CSS links (often already 404 on the live site, e.g. WP-era
    # uploads in old offer texts) are only fatal when they explode
    errs = meta.get('errors', 0)
    page_errs = meta.get('page_errors', errs)
    if page_errs > max(100, stats["pages"] * 0.05):
        bad.append(f'{page_errs} page crawl errors {meta.get("error_sample")}')
    if errs - page_errs > max(1000, stats["pages"] * 0.5):
        bad.append(f'{errs - page_errs} asset crawl errors {meta.get("error_prefixes")}')
    return bad


def smoke():
    sys.path.insert(0, str(HERE))
    import smoke as sm
    return sm.main([DOMAIN] + SITE.get('smoke_paths', []))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['run', 'smoke'])
    ap.add_argument('--mode', choices=['full', 'quick'], default='full')
    ap.add_argument('--no-deploy', action='store_true')
    ap.add_argument('--limit', type=int, default=0, help='test: stop the crawl after N files')
    ap.add_argument('--keep', action='store_true', help='keep .static-work/out after the run')
    a = ap.parse_args()
    if a.cmd == 'smoke':
        return smoke()
    t0 = time.time()
    WORK.mkdir(parents=True, exist_ok=True)
    if not (DIST / 'server' / 'wrangler.json').exists():
        sys.exit('dist/ missing: CLOUDFLARE_ENV=render pnpm exec astro build')
    group('state')
    db = prepare_db()
    imported = None
    if a.mode == 'full':
        group('imports')
        imported = run_imports(db)
    group('render + crawl')
    with Server():
        meta = crawl(a.limit, db)
    for cmd in SITE.get('post_crawl', []):   # e.g. eroka: thumbnails -> R2 img.eroka.cz + URL rewrite
        argv = [x.replace('{out}', str(OUT)).replace('{data}', str(DATA)) for x in cmd]
        r = subprocess.run(argv, cwd=APP)
        log(f'post-crawl {argv[1] if len(argv) > 1 else argv[0]}: exit {r.returncode}')
        if r.returncode:
            sys.exit('post-crawl step failed')
    group('exits')
    sys.path.insert(0, str(HERE))
    import go_exits
    exits = go_exits.write(SITE, OUT, db)
    stats = {'pages': html_count(), 'exits': exits, 'files': sum(1 for p in OUT.rglob('*') if p.is_file()),
             'crawl_errors': meta.get('errors', 0), 'redirects': meta.get('redirects', 0), 'imported': imported,
             'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    log('stats:', json.dumps(stats))
    # the import result is kept even if the deploy is refused (next run starts from it)
    import sqlite3
    c = sqlite3.connect(db)
    c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    c.close()
    shutil.copyfile(db, STATE_DB)
    bad = guard(meta, stats)
    if bad and not a.limit:
        log('REFUSED to deploy:', '; '.join(bad))
        return 3
    if a.no_deploy or a.limit:
        log(f'no deploy ({time.time() - t0:.0f} s); output in {OUT}')
        return 0
    group('deploy')
    import deploy
    deploy.deploy(SITE, OUT, DATA / 'shards.json')
    META.write_text(json.dumps(stats, indent=1))
    for cmd in SITE.get('post_deploy', []):   # e.g. kakapo: IndexNow only once the pages are live
        argv = [x.replace('{db}', str(STATE_DB)).replace('{data}', str(DATA)) for x in cmd]
        r = subprocess.run(argv, cwd=APP)
        log(f'post-deploy {argv[1] if len(argv) > 1 else argv[0]}: exit {r.returncode}')
    if not a.keep:
        shutil.rmtree(OUT, ignore_errors=True)
    group('smoke')
    time.sleep(15)
    rc = smoke()
    log(f'done in {time.time() - t0:.0f} s')
    return rc


if __name__ == '__main__':
    sys.exit(main())
