#!/usr/bin/env bash
# Loads the WordPress export SQL (scripts/migrate-from-wp.py output) into a D1 database.
#   scripts/load-d1.sh local   <sql-dir>    → local miniflare D1 (.wrangler/state), recreated from scratch
#   scripts/load-d1.sh staging <sql-dir>    → remote kouzelnydeda-staging (schema must be fresh: migrations apply first)
# Production is loaded only at the cutover and needs KD_PRODUCTION_APPROVED=yes.
set -euo pipefail
target="${1:?local|staging|production}"; dir="$(realpath "${2:?sql dir}")"
cd "$(dirname "$0")/.."
case "$target" in
  local)
    rm -rf .wrangler/state/v3/d1
    npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state >/dev/null
    for f in "$dir"/*.sql; do npx wrangler d1 execute DB --local --persist-to .wrangler/state --file "$f" >/dev/null || { echo "CHYBA $f"; exit 1; }; done ;;
  staging|production)
    if [ "$target" = production ] && [ "${KD_PRODUCTION_APPROVED:-}" != yes ]; then echo "production needs KD_PRODUCTION_APPROVED=yes"; exit 2; fi
    # wrangler auth: global key (credentials/.cloudflare-credentials.env) + account id
    val() { grep -E "^$2=" "/home/kenny/ai/credentials/$1" | head -1 | cut -d= -f2- | tr -d "\"'"; }
    export CLOUDFLARE_EMAIL="$(val .cloudflare-credentials.env CF_EMAIL)" CLOUDFLARE_API_KEY="$(val .cloudflare-credentials.env CF_GLOBAL_API_KEY)" CLOUDFLARE_ACCOUNT_ID="$(val .kouzelnydeda-credentials.env CF_ACCOUNT_ID)"
    for f in "$dir"/*.sql; do
      for try in 1 2 3; do
        npx wrangler d1 execute DB --env "$target" --remote --yes --file "$f" >/dev/null 2>&1 && break
        [ $try = 3 ] && { echo "CHYBA $f"; exit 1; }; sleep 5
      done
      echo "ok $f"
    done ;;
  *) echo "neznámý cíl $target"; exit 2 ;;
esac
if [ "$target" = local ]; then where=(--local --persist-to .wrangler/state); else where=(--env "$target" --remote); fi
npx wrangler d1 execute DB "${where[@]}" --json \
  --command "SELECT (SELECT COUNT(*) FROM products) products, (SELECT COUNT(*) FROM cat_products) members, (SELECT COUNT(*) FROM redirects) redirects, (SELECT COUNT(*) FROM posts) posts" | grep -A5 '"results"'
