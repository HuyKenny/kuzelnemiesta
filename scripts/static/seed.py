#!/usr/bin/env python3
"""First state of the static build: the last D1 backup (workspace backups/d1-2026-11-23/<db>.sql.gz, exported WITHOUT the FTS5
virtual tables because `wrangler d1 export` refuses them) -> data/state.db, then the FTS tables are re-created from the
migrations and refilled from the content tables (site.json "fts"). Run once on Malina, then `scripts/static/state.sh push`.

    python3 scripts/static/seed.py <backup.sql.gz>
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
    buf, n = [], 0
    for line in gzip.open(src, 'rt', encoding='utf-8'):
        buf.append(line)
        if line.rstrip().endswith(';'):
            s = ''.join(buf)
            if sqlite3.complete_statement(s):
                if not s.lstrip().upper().startswith('PRAGMA'):
                    con.execute(s)
                buf, n = [], n + 1
    # FTS5 tables: same CREATE statement as the migrations, content rebuilt from the tables
    have = {r[0] for r in con.execute("SELECT name FROM sqlite_master")}
    for f in sorted((APP / 'migrations').glob('*.sql')):
        for m in re.finditer(r'CREATE VIRTUAL TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)[^;]*;', f.read_text(), re.I | re.S):
            if m.group(1) not in have:
                con.execute(m.group(0))
                print(f'fts: created {m.group(1)}')
    for sql in SITE.get('fts', []):
        c = con.execute(sql)
        print(f'fts: {c.rowcount} rows <- {sql[:70]}')
    con.execute('COMMIT')
    con.execute('VACUUM')
    con.close()
    tmp.replace(out)
    print(f'seed: {n} statements in {time.time() - t:.0f} s -> {out} ({out.stat().st_size // 1_000_000} MB)')


if __name__ == '__main__':
    main(sys.argv[1])
