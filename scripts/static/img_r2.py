#!/usr/bin/env python3
"""(static build copy of ~/ai/scripts/cloudflare-free/img-na-r2.py: token auth, caches in --state, no scan cache)
Frozen shop site: point product thumbnails straight at the R2 bucket (custom domain), no image Worker.

The SSR shops (eroka) served thumbnails through an image Worker:  /img/<w>/<sig>/<base64url(source)>.webp,
which kept each computed thumbnail in R2 under  <w>/<sha256(base64url)>.webp.  The bucket is exposed on a custom
domain (img.eroka.cz, zone cache rule = 1 year), so the frozen HTML can reference the R2 object directly and the
Worker is never invoked.

    img-na-r2.py <out dir> --bucket eroka-thumbs --base https://img.eroka.cz [--dry-run]
                 [--put https://eroka.cz/img/_put --secret-file credentials/.eroka-credentials.env]
                 [--no-rewrite] [--rewrite-only]

1. scans every .html/.css/.xml/.json/.webmanifest under <out dir> for /img/ URLs (relative or absolute); the result
   and the bucket listing are cached next to <out dir> (<out>.img-scan.json, <out>.img-have.json) for re-runs;
2. thumbnails missing in the bucket are made here — each source photo is fetched ONCE and every width it needs is
   cut from it (fit inside w × w, never enlarged, Lanczos, WebP q76 — same as the Worker); memory only, no disk.
   Upload: --put = the image Worker's signed PUT endpoint (no Cloudflare API rate limit; header x-put-sig =
   HMAC-SHA256(IMG_SECRET, "put/<key>")[:16]); without --put through the R2 object REST API (counts against the
   account-wide API limit of 1 200 requests / 5 min — fine for a few thousand, not for 100 k);
3. rewrites the URLs in place.  A photo that cannot be fetched or decoded keeps the shop's original URL (the Worker
   redirected to it as well).
"""
import argparse
import base64
import concurrent.futures as cf
import hashlib
import hmac
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

IMG_RE = re.compile(r'(?:https?://(?:www\.)?[a-z0-9.-]+)?/img/(\d+)/[0-9a-f]{16}/([A-Za-z0-9_-]{8,1400})\.webp')
TEXT_EXT = (".html", ".css", ".xml", ".json", ".webmanifest", ".txt")
MAX_BYTES = 8_000_000
UA = "Mozilla/5.0 (compatible; eroka.cz thumbnails)"
UA_PUT = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 img-na-r2"


def envfile(path):
    c = {}
    for l in open(path):
        if "=" in l and not l.startswith("#"):
            k, v = l.strip().split("=", 1)
            c[k] = v.strip('"\'')
    return c


import os
# CI (static build): scoped token with R2 write; Malina: the global key from credentials/
if os.environ.get("CLOUDFLARE_API_TOKEN"):
    C = {"CF_ACCOUNT_ID": os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")}
    H = {"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]}
else:
    C = envfile("/home/kenny/ai/credentials/.cloudflare-credentials.env")
    H = {"X-Auth-Email": C["CF_EMAIL"], "X-Auth-Key": C.get("CF_GLOBAL_API_KEY") or C["CF_API_KEY"]}


def api(path, method="GET", data=None, headers=None):
    req = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, method=method, data=data,
                                 headers={**H, **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def account():
    return C.get("CF_ACCOUNT_ID") or api("/accounts")["result"][0]["id"]


def list_keys(acc, bucket):
    keys, cur = set(), None
    while True:
        r = api(f"/accounts/{acc}/r2/buckets/{bucket}/objects?per_page=1000" + (f"&cursor={cur}" if cur else ""))
        keys.update(o["key"] for o in r["result"])
        info = r.get("result_info") or {}
        if not info.get("is_truncated"):
            return keys
        cur = info["cursor"]


def b64dec(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode("utf-8")


def rkey(w, b):
    return f"{w}/{hashlib.sha256(b.encode()).hexdigest()}.webp"


def fetch_image(src):
    """Decoded PIL image, or None when the photo cannot be fetched/decoded."""
    try:
        req = urllib.request.Request(src, headers={"User-Agent": UA, "Accept": "image/webp,image/jpeg,image/png,*/*"})
        with urllib.request.urlopen(req, timeout=40) as r:
            buf = r.read(MAX_BYTES + 1)
        if len(buf) > MAX_BYTES or len(buf) < 12:
            return None
        im = Image.open(io.BytesIO(buf))
        if im.width * im.height > 25_000_000:
            return None
        im.load()
        return im.convert("RGBA") if im.mode in ("RGBA", "LA", "P", "PA") else im.convert("RGB")
    except Exception:
        return None


def thumb(im, w):
    scale = min(1, w / im.width, w / im.height)
    if scale < 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=76, method=4)
    return out.getvalue()


def scan(out, files):
    need = {}
    for p in files:
        t = p.read_text(encoding="utf-8", errors="replace")
        if "/img/" not in t:
            continue
        for m in IMG_RE.finditer(t):
            need[(int(m.group(1)), m.group(2))] = None
    return list(need)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--base", required=True, help="public base of the bucket, e.g. https://img.eroka.cz")
    ap.add_argument("--threads", type=int, default=6)
    ap.add_argument("--put", help="signed PUT endpoint of the image Worker, e.g. https://eroka.cz/img/_put")
    ap.add_argument("--secret-file", help="env file with IMG_SECRET (for --put)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-rewrite", action="store_true", help="only make + upload the missing thumbnails")
    ap.add_argument("--rewrite-only", action="store_true", help="skip making thumbnails; rewrite what the bucket has")
    ap.add_argument("--relist", action="store_true", help="ignore the cached bucket listing")
    ap.add_argument("--state", help="directory for the bucket listing + fallback caches (static build: data/, kept in the state)")
    a = ap.parse_args()
    out = Path(a.out)
    files = [p for p in out.rglob("*") if p.is_file() and p.suffix in TEXT_EXT and not p.parts[len(out.parts)] == "go"]
    need = scan(out, files)
    acc = account()
    sd = Path(a.state) if a.state else out.parent
    have_f = sd / (("img-have.json") if a.state else (out.name + ".img-have.json"))
    if have_f.exists() and not a.relist:
        have = set(json.loads(have_f.read_text()))
    else:
        have = list_keys(acc, a.bucket)
        have_f.write_text(json.dumps(sorted(have)))
    fb_f = sd / (("img-fallback.json") if a.state else (out.name + ".img-fallback.json"))
    fallback = {tuple(k.split("/", 1)): v for k, v in json.loads(fb_f.read_text()).items()} if fb_f.exists() else {}
    fallback = {(int(w), b): v for (w, b), v in fallback.items()}
    missing = [k for k in need if rkey(*k) not in have and k not in fallback]
    groups = {}
    for w, b in missing:
        groups.setdefault(b, []).append(w)
    print(f"thumbnails: {len(files)} files, {len(need)} distinct, in R2 {len(need) - len(missing)}, missing {len(missing)} "
          f"({len(groups)} source photos)", flush=True)
    if a.dry_run:
        return 0

    secret = envfile(a.secret_file)["IMG_SECRET"] if a.put else None

    def upload(key, data):
        if a.put:
            sig = hmac.new(secret.encode(), f"put/{key}".encode(), hashlib.sha256).hexdigest()[:16]
            req = urllib.request.Request(f"{a.put}/{key}", data=data, method="PUT",
                                         headers={"x-put-sig": sig, "content-type": "image/webp", "user-agent": UA_PUT})
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status != 201:
                    raise RuntimeError(f"status {r.status}")
        else:
            api(f"/accounts/{acc}/r2/buckets/{a.bucket}/objects/{key}", "PUT", data, {"Content-Type": "image/webp"})

    def one(b):
        """-> (b, [(w, ok)], source or 'bad')"""
        try:
            src = b64dec(b)
        except Exception:
            return b, [], "bad"
        im = fetch_image(src)
        res = []
        for w in groups[b]:
            ok = False
            if im is not None:
                try:
                    data = thumb(im, w)
                except Exception:
                    data = None
                for i in range(4) if data else ():
                    try:
                        upload(rkey(w, b), data)
                        ok = True
                        break
                    except Exception as e:
                        err = e
                        time.sleep(2 * (i + 1))
                if data and not ok:
                    print("upload selhal", rkey(w, b), str(err)[:100], file=sys.stderr, flush=True)
            res.append((w, ok))
        return b, res, src

    if not a.rewrite_only and groups:
        done = made = 0
        t0 = time.time()
        with cf.ThreadPoolExecutor(a.threads) as ex:
            for b, res, src in ex.map(one, list(groups)):
                done += 1
                for w, ok in res:
                    if ok:
                        have.add(rkey(w, b))
                        made += 1
                    else:
                        fallback[(w, b)] = src
                if src == "bad":
                    for w in groups[b]:
                        fallback[(w, b)] = "bad"
                if done % 200 == 0:
                    have_f.write_text(json.dumps(sorted(have)))
                    fb_f.write_text(json.dumps({f"{w}/{b}": s for (w, b), s in fallback.items()}))
                    print(f"  {done}/{len(groups)} fotek, {made} náhledů nahráno, {len(fallback)} bez náhledu, "
                          f"{(time.time() - t0) / done:.2f} s/fotka", flush=True)
        have_f.write_text(json.dumps(sorted(have)))
        fb_f.write_text(json.dumps({f"{w}/{b}": s for (w, b), s in fallback.items()}))
        print(f"vytvořeno {made}, bez náhledu (původní URL) {len(fallback)}", flush=True)
    if a.no_rewrite:
        return 0

    left = 0

    def sub(m):
        nonlocal left
        k = (int(m.group(1)), m.group(2))
        key = rkey(*k)
        if key in have:
            return f"{a.base}/{key}"
        fb = fallback.get(k)
        if fb and fb != "bad":
            return fb.replace('"', "%22").replace("'", "%27").replace(" ", "%20").replace(",", "%2C")
        left += 1
        return m.group(0)

    changed = 0
    for p in files:
        t = p.read_text(encoding="utf-8", errors="replace")
        if "/img/" not in t:
            continue
        n = IMG_RE.sub(sub, t)
        if n != t:
            p.write_text(n, encoding="utf-8")
            changed += 1
    print(f"přepsáno {changed} souborů, ponecháno /img/ {left} výskytů", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
