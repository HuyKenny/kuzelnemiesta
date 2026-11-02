# Deploy a přepnutí

## Staging (hotovo 30. 10. 2026)
`npx tsx scripts/deploy.ts --env staging [--secrets]` — záložka D1 Time Travel, migrace, import Worker, build, kontrola
tajemství, deploy, smoke test (servisní token Access). Data: `scripts/load-d1.sh staging <sql>`, pak
`POST /run/<slevomat|adrop|zazitky>` (Slevomat 3× kvůli limitu zápisů) a `POST /finalize?force=1` na import Workeru
(Bearer `IMPORT_SHARED_SECRET_STAGING`).

## Produkce — AŽ NA KENNYHO POKYN
1. Čerstvý export: `python3 scripts/export-from-wp.py backups/kouzelnydeda-wp-export-<datum>` + `live-meta-snapshot.py`
   + `migrate-from-wp.py` → `KD_PRODUCTION_APPROVED=yes scripts/load-d1.sh production <sql>` (po `wrangler d1 migrations apply --env production --remote`).
2. `python3 scripts/set-feed-secrets.py production`, `KD_PRODUCTION_APPROVED=yes npx tsx scripts/deploy.ts --env production --secrets`,
   importy + finalize na `kouzelnydeda-import` (stejně jako staging), kontrola na https://kouzelnydeda.huy-kenny.workers.dev/api/health.
3. **Hned po spuštění importu Workeru vypnout WP All Import** (12 úloh „kouzelnydeda WPAI“ v `bin/cronjob-org.py`), jinak
   by WEDOS dál zbytečně importoval.
4. `KD_PRODUCTION_APPROVED=yes python3 scripts/cutover.py apply` — záloha a smazání Cache Rules z doby WP (vypínají Cache
   API Workeru), browser TTL 0, routy `kouzelnydeda.cz/*` + `www`, purge. Návrat: `… cutover.py rollback`.
5. Ověřit `X-Kd-Page-Cache: HIT`, GSC (property `https://kouzelnydeda.cz/`) odeslat sitemapu, IndexNow, hlídač
   `/api/health` (cron-job.org, **GET**), vypnout kouzelnydeda v `bin/all-wp-cron.sh` a `bin/wp-udrzba.py`.
6. WordPress smazat nejdřív za týden, s finální zálohou (`scripts/kouzelnydeda/wp-db.py db|files`) a jen se souhlasem.
