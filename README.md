# kouzelnydeda.cz — Astro + Cloudflare

Katalog zážitků, pobytů a slev od partnerů (Slevomat, Adrop, Zážitky.cz). 30. 10. 2026 převeden z WordPressu
(ReHub + WooCommerce external + WP All Import + Rank Math na WEDOS) na Astro SSR Worker + D1. Kód vychází z
`apps/alkoholicky`, datový model je jiný: **1 nabídka partnera = 1 stránka**, nabídky denně vznikají a končí.

| Co | Kde |
|---|---|
| Web (Astro 7.3.8 SSR, Worker `kouzelnydeda` / `kouzelnydeda-staging`) | `src/`, `wrangler.jsonc` |
| Import feedů (Worker `kouzelnydeda-import`, cron */20, Slevomat po 6 h, Adrop + Zážitky po 12 h) | `workers/import/` (`src/feeds.ts` = feedy, affiliate odkazy, mapování kategorií z WPAI) |
| D1 schéma | `migrations/0001_init.sql` |
| Převod z WordPressu | `scripts/export-from-wp.py` → `scripts/live-meta-snapshot.py` → `scripts/migrate-from-wp.py` → `scripts/load-d1.sh` |
| Deploy | `npx tsx scripts/deploy.ts --env staging [--secrets] [--no-import]` (produkce jen s `KD_PRODUCTION_APPROVED=yes`) |
| Tajné klíče importu | `python3 scripts/set-feed-secrets.py <staging\|production>` |
| Přepnutí domény / návrat | `scripts/cutover.py status\|apply\|rollback` |
| SEO parita | `python3 scripts/seo-parity.py <base> <export>/live-meta.json` |
| Lokální náhled | `scripts/dev-preview.sh` → http://localhost:8797 |

Staging: https://kouzelnydeda-staging.huy-kenny.workers.dev (Cloudflare Access, Kennyho e-mail + servisní token).
Podrobnosti: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), postup přepnutí [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Přístupy: `credentials/.kouzelnydeda-credentials.env` (účet, Access, soli, import secret), `credentials/.kouzelnydeda-feeds.json`
(URL feedů; Slevomat s tokenem). Nic z toho nepatří do repa.
