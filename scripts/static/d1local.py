"""`wrangler d1 execute --remote` replacement for the static build (Cloudflare Workers Free, 2026-11: the D1 databases are gone).

Scripts that wrote D1 through wrangler check STATIC_DB (path of the local SQLite state, set by scripts/static/run-worker.ts) and
call these instead. Same result shape as `wrangler d1 execute --json`: a list of row dicts for a command, text for a file.
"""
import os
import sqlite3


def _con():
    con = sqlite3.connect(os.environ["STATIC_DB"], timeout=60, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 60000")
    return con


def query(sql):
    con = _con()
    try:
        if sqlite3.complete_statement(sql.strip().rstrip(";") + ";") and sql.strip().rstrip(";").count(";") == 0:
            return [dict(r) for r in con.execute(sql)]
        con.executescript(sql)
        return []
    finally:
        con.close()


def run_file(path):
    con = _con()
    try:
        con.executescript("BEGIN;\n" + open(path, encoding="utf-8").read() + "\nCOMMIT;")
        return '[{"results": [], "success": true}]'
    finally:
        con.close()
