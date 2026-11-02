#!/usr/bin/env python3
"""Feed URLs + import secret → the import Worker of an environment (values never printed).

    python3 scripts/set-feed-secrets.py <staging|production>

Reads credentials/.kuzelnemiesta-feeds.json (zlavomat carries an auth token) and IMPORT_SHARED_SECRET_<ENV> from
credentials/.kuzelnemiesta-credentials.env.
"""
import json
import os
import subprocess
import sys

env = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if env not in ("staging", "production"):
    sys.exit(__doc__)
CRED = "/home/kenny/ai/credentials"
c = {}
for f in (".cloudflare-credentials.env", ".kuzelnemiesta-credentials.env"):
    for line in open(f"{CRED}/{f}"):
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.strip().split("=", 1)
            c.setdefault(k, v.strip("\"'"))
feeds = json.load(open(f"{CRED}/.kuzelnemiesta-feeds.json"))
secrets = {f"FEED_URL_{k.upper()}": feeds[k].replace("http://", "https://") for k in ("zlavomat", "adrop")}
secrets["IMPORT_SHARED_SECRET"] = c[f"IMPORT_SHARED_SECRET_{env.upper()}"]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
node = "/home/kenny/.nvm/versions/node/v22.23.1/bin"
r = subprocess.run([f"{node}/node", f"{root}/node_modules/wrangler/bin/wrangler.js", "secret", "bulk", "-c", "workers/import/wrangler.jsonc", "--env", env],
                   input=json.dumps(secrets), text=True, capture_output=True, cwd=root,
                   env={**os.environ, "PATH": f"{node}:{os.environ['PATH']}", "CLOUDFLARE_EMAIL": c["CF_EMAIL"],
                        "CLOUDFLARE_API_KEY": c["CF_GLOBAL_API_KEY"], "CLOUDFLARE_ACCOUNT_ID": c["CF_ACCOUNT_ID"]})
print("ok" if r.returncode == 0 else "FAILED", sorted(secrets))
if r.returncode:
    print(r.stderr[-800:])
    sys.exit(1)
