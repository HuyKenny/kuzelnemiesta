#!/usr/bin/env python3
"""Cloudflare Access for the staging host kuzelnemiesta-staging.huy-kenny.workers.dev (idempotent).

Copies the policies of the eroka staging application (Kenny's e-mails + the shared "Automated checks" service token the
deploy smoke test uses) and writes ACCESS_AUD_STAGING into credentials/.kuzelnemiesta-credentials.env (never printed).
"""
import json
import re
import urllib.error
import urllib.request

CRED = "/home/kenny/ai/credentials/.kuzelnemiesta-credentials.env"
ENV = {}
for f in ("/home/kenny/ai/credentials/.cloudflare-credentials.env", CRED):
    for line in open(f, encoding="utf-8"):
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.strip().split("=", 1)
            ENV.setdefault(k, v.strip("\"'"))
HDR = {"X-Auth-Email": ENV["CF_EMAIL"], "X-Auth-Key": ENV["CF_GLOBAL_API_KEY"], "Content-Type": "application/json"}
API = f"https://api.cloudflare.com/client/v4/accounts/{ENV['CF_ACCOUNT_ID']}/access"
HOST = "kuzelnemiesta-staging.huy-kenny.workers.dev"


def cf(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


apps = cf("GET", "/apps?per_page=200").get("result") or []
src = next(a for a in apps if a.get("domain", "").startswith("eroka-staging.huy-kenny.workers.dev"))
mine = next((a for a in apps if a.get("domain", "").startswith(HOST)), None)
pols = []
for i, p in enumerate(src.get("policies") or []):
    pols.append({k: p[k] for k in ("name", "decision", "include", "exclude", "require") if k in p} | {"precedence": i + 1})
body = {"name": "kuzelnemiesta staging", "type": "self_hosted", "domain": HOST, "session_duration": src.get("session_duration", "24h"),
        "app_launcher_visible": False, "skip_interstitial": True, "policies": pols}
r = cf("PUT", f"/apps/{mine['id']}", body) if mine else cf("POST", "/apps", body)
if not r.get("success"):
    raise SystemExit(f"access app: {r.get('errors')}")
text = open(CRED, encoding="utf-8").read()
line = f"ACCESS_AUD_STAGING={r['result']['aud']}"
text = re.sub(r"^ACCESS_AUD_STAGING=.*$", line, text, flags=re.M) if re.search(r"^ACCESS_AUD_STAGING=", text, flags=re.M) else text.rstrip("\n") + "\n" + line + "\n"
open(CRED, "w", encoding="utf-8").write(text)
print("access app:", "updated" if mine else "created", "| policies:", [p["name"] for p in pols], "| AUD saved")
