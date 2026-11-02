#!/usr/bin/env python3
"""Switch kuzelnemiesta.sk between WordPress (WEDOS origin) and the Worker "kuzelnemiesta".

    KD_PRODUCTION_APPROVED=yes scripts/cutover.py apply      # Worker live on kuzelnemiesta.sk + www
    KD_PRODUCTION_APPROVED=yes scripts/cutover.py rollback   # back to WordPress (origin untouched meanwhile)
    scripts/cutover.py status

apply:    back up the zone cache ruleset (backups/kuzelnemiesta-cf-zone-<date>/), drop the WordPress-era Cache Rules (they turn
          off the Worker's Cache API), browser cache TTL 0 (= respect headers), routes kuzelnemiesta.sk/* + www.kuzelnemiesta.sk/*,
          purge everything.
rollback: delete the routes, restore the Cache Rules + browser TTL from the backup given by --from (default: newest),
          purge everything.
"""
import datetime
import glob
import json
import os
import sys
import urllib.request

ROOT = "/home/kenny/ai"
SCRIPT = "kuzelnemiesta"
PATTERNS = ["kuzelnemiesta.sk/*", "www.kuzelnemiesta.sk/*"]
WP_BROWSER_TTL = 31536000  # zone value before the cutover (checked 30. 10. 2026)


def env(name):
    out = {}
    for line in open(f"{ROOT}/credentials/{name}"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip("\"'")
    return out


cf, er = env(".cloudflare-credentials.env"), env(".kuzelnemiesta-credentials.env")
ZONE = er.get("CF_ZONE_ID") or er["CF_ZONE"]


def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/zones/{ZONE}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Auth-Email": cf["CF_EMAIL"], "X-Auth-Key": cf["CF_GLOBAL_API_KEY"],
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        d = json.load(e)
        if e.code == 404 and method == "GET":
            return d
        sys.exit(f"{method} {path}: {e.code} {d.get('errors')}")


def routes():
    return [r for r in api("GET", "/workers/routes")["result"] if r["pattern"] in PATTERNS]


def cache_ruleset():
    return api("GET", "/rulesets/phases/http_request_cache_settings/entrypoint").get("result") or {}


def purge():
    api("POST", "/purge_cache", {"purge_everything": True})
    print("purge everything: ok")


def status():
    print("routes:", [(r["pattern"], r.get("script")) for r in routes()] or "none (WordPress)")
    print("cache rules:", [x.get("description") for x in cache_ruleset().get("rules", [])])
    print("browser_cache_ttl:", api("GET", "/settings/browser_cache_ttl")["result"]["value"])


def apply():
    d = f"{ROOT}/backups/kuzelnemiesta-cf-zone-{datetime.date.today().isoformat()}"
    os.makedirs(d, exist_ok=True)
    rs = cache_ruleset()
    json.dump(rs, open(f"{d}/cache-ruleset.json", "w"), ensure_ascii=False, indent=1)
    print(f"backup: {d}/cache-ruleset.json ({len(rs.get('rules', []))} rules)")
    if rs.get("rules"):
        api("PUT", f"/rulesets/{rs['id']}", {"rules": []})
        print("cache rules: removed")
    api("PATCH", "/settings/browser_cache_ttl", {"value": 0})
    print("browser_cache_ttl: 0 (respect headers)")
    have = {r["pattern"] for r in routes()}
    for p in PATTERNS:
        if p not in have:
            api("POST", "/workers/routes", {"pattern": p, "script": SCRIPT})
        print(f"route {p} → {SCRIPT}")
    purge()


def rollback():
    for r in routes():
        api("DELETE", f"/workers/routes/{r['id']}")
        print(f"route {r['pattern']}: deleted")
    src = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else sorted(glob.glob(f"{ROOT}/backups/kuzelnemiesta-cf-zone-*/cache-ruleset.json"))[-1]
    saved = json.load(open(src))
    keep = [{k: v for k, v in x.items() if k in ("action", "action_parameters", "description", "enabled", "expression")} for x in saved.get("rules", [])]
    if keep:
        rs = cache_ruleset()
        if rs.get("id"):
            api("PUT", f"/rulesets/{rs['id']}", {"rules": keep})
        else:
            api("PUT", "/rulesets/phases/http_request_cache_settings/entrypoint", {"rules": keep})
        print(f"cache rules: restored {len(keep)} from {src}")
    api("PATCH", "/settings/browser_cache_ttl", {"value": WP_BROWSER_TTL})
    print(f"browser_cache_ttl: {WP_BROWSER_TTL}")
    purge()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd in ("apply", "rollback") and os.environ.get("KD_PRODUCTION_APPROVED") != "yes":
        sys.exit(f"{cmd} needs KD_PRODUCTION_APPROVED=yes")
    {"apply": apply, "rollback": rollback, "status": status}.get(cmd, lambda: sys.exit(__doc__))()
