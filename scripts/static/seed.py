#!/usr/bin/env python3
"""First state of the static build: the last D1 backup (workspace backups/d1-2026-11-23/<db>.sql.gz) -> data/state.db.

The backups of the FTS sites were made by scripts/cloudflare-free/d1-zaloha-bez-fts.sh (`wrangler d1 export --table …`):
no FTS5 virtual tables, NO indexes (not even UNIQUE ones: upserts then fail with "ON CONFLICT clause does not match") and
no triggers. The tables come from the backup (production has columns added outside the migrations), then every index,
trigger and FTS table of the migrations is replayed in migration order (CREATE … IF NOT EXISTS, DROP …), and the FTS
tables are refilled from the content tables (site.json "fts"). Run once on Malina, then `scripts/static/state.sh push`.

    python3 scripts/static/seed.py <backup.sql.gz>
    python3 scripts/static/seed.py --fix-indexes data/state.db   # add the missing indexes to an existing state
"""
import gzip
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
SITE = json.loads((HERE / 'site.json').read_text())
SCHEMA = re.compile(r'^\s*(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|CREATE\s+TRIGGER|DROP\s+TRIGGER|CREATE\s+VIRTUAL\s+TABLE)', re.I)


def split(lines):
    buf = []
    for line in lines:
        if not buf and (not line.strip() or line.lstrip().startswith('--')):
            continue
        buf.append(line)
        if line.rstrip().endswith(';'):
            s = ''.join(buf)
            if sqlite3.complete_statement(s):
                yield s
                buf = []


def if_not_exists(s):
    s = re.sub(r'^(\s*CREATE\s+(?:UNIQUE\s+)?INDEX)\s+(?!IF\s+NOT\s+EXISTS)', r'\1 IF NOT EXISTS ', s, count=1, flags=re.I)
    s = re.sub(r'^(\s*CREATE\s+TRIGGER)\s+(?!IF\s+NOT\s+EXISTS)', r'\1 IF NOT EXISTS ', s, count=1, flags=re.I)
    s = re.sub(r'^(\s*CREATE\s+VIRTUAL\s+TABLE)\s+(?!IF\s+NOT\s+EXISTS)', r'\1 IF NOT EXISTS ', s, count=1, flags=re.I)
    s = re.sub(r'^(\s*DROP\s+(?:INDEX|TRIGGER))\s+(?!IF\s+EXISTS)', r'\1 IF EXISTS ', s, count=1, flags=re.I)
    return s


def main(src):
    out = APP / 'data' / 'state.db'
    out.parent.mkdir(exist_ok=True)
    tmp = out.with_suffix('.seed')
    tmp.unlink(missing_ok=True)
    t = time.time()
    con = sqlite3.connect(tmp, isolation_level=None)
    con.execute('PRAGMA journal_mode=OFF')
    con.execute('PRAGMA synchronous=OFF')
    con.execute('BEGIN')
    n = 0
    for s in split(gzip.open(src, 'rt', encoding='utf-8')):
        if not s.lstrip().upper().startswith('PRAGMA'):
            con.execute(s)
            n += 1
    con.execute('COMMIT')
    replay(con)
    con.execute('VACUUM')
    con.close()
    tmp.replace(out)
    print(f'seed: {n} statements in {time.time() - t:.0f} s -> {out} ({out.stat().st_size // 1_000_000} MB)')


def replay(con, refill=True):
    """indexes, triggers and FTS tables of the migrations, in order (a later migration may drop or replace them)"""
    ok = bad = 0
    for f in sorted((APP / 'migrations').glob('*.sql')):
        for s in split(f.read_text().splitlines(keepends=True)):
            if not SCHEMA.match(s):
                continue
            try:
                con.execute(if_not_exists(s))
                ok += 1
            except sqlite3.Error as e:
                bad += 1
                print(f'schema: {f.name}: {str(e)[:90]} <- {" ".join(s.split())[:90]}')
    for sql in SITE.get('fts', []) if refill else []:
        con.execute(f'DELETE FROM {sql.split("INSERT INTO ")[1].split()[0]}')
        c = con.execute(sql)
        print(f'fts: {c.rowcount} rows <- {sql[:70]}')
    idx = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").fetchone()[0]
    trg = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'").fetchone()[0]
    print(f'schema: {ok} statements replayed ({bad} failed); now {idx} indexes, {trg} triggers')


if __name__ == '__main__':
    if sys.argv[1] == '--fix-indexes':   # an existing state built by the first version of this script (no indexes)
        c = sqlite3.connect(sys.argv[2], isolation_level=None)
        replay(c, refill=False)
        c.close()
    else:
        main(sys.argv[1])
