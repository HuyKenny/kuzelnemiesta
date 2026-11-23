#!/usr/bin/env bash
# Encrypted build state for the PUBLIC repo (pattern of apps/kurzovyradar): data/state.db (SQLite with the D1 schema: catalogue,
# import runs, price history), data/shards.json (sticky Worker shard plan), data/static-meta.json (size of the last deploy)
# and other data/*.json caches (eroka: img-have.json, the thumbnails already in R2).
# Kept as the release asset `state.enc` of the release `state`; unreadable without STATE_KEY (a GitHub secret).
#   scripts/static/state.sh pull   # download + decrypt into data/ (fails if there is none: seed first, scripts/static/seed.py)
#   scripts/static/state.sh push   # encrypt + upload
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${STATE_KEY:?STATE_KEY missing}"
TMP=${RUNNER_TEMP:-/tmp}/state.enc
case "${1:-}" in
  pull)
    mkdir -p data
    gh release download state -p 'state.enc' -O "$TMP" --clobber
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:STATE_KEY -in "$TMP" | tar xz
    rm -f "$TMP"
    echo "state restored ($(du -h data/state.db | cut -f1))" ;;
  push)
    [ -f data/state.db ] || { echo "no state to save"; exit 1; }
    tar c data/state.db $(ls data/*.json 2>/dev/null) | gzip -6 \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:STATE_KEY -out "$TMP"
    gh release view state >/dev/null 2>&1 || gh release create state --title "build state (encrypted)" \
      --notes "Encrypted catalogue state between nightly builds (scripts/static/state.sh). Not a software release." --latest=false
    gh release upload state "$TMP" --clobber
    echo "state saved ($(du -h "$TMP" | cut -f1))"
    rm -f "$TMP" ;;
  *) echo "usage: $0 pull|push"; exit 2 ;;
esac
