// GET /api/health — monitoring (cron-job.org): 200 when the offer import is fresh, 503 with reasons otherwise. No secrets.
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';

export const prerender = false;
const MAX_AGE_H = 200; // imports run weekly (Monday night)
const MIN_OFFERS = 500;  // kuzelnemiesta.sk: catalogue size unknown at the fork (2. 11. 2026) — raise to ~60 % of the live count after the first imports

export const GET: APIRoute = async () => {
  const db = getEnv().DB;
  const [offers, version, sm] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
    db.prepare("SELECT value, updated_at FROM site_cache WHERE key = 'data_version'"),
    db.prepare("SELECT updated_at FROM site_cache WHERE key = 'sitemap:index'"),
  ]);
  const n = Number((offers!.results[0] as { n: number })?.n ?? 0);
  const v = (version!.results[0] as { value: string; updated_at: string } | undefined) ?? null;
  const smAt = (sm!.results[0] as { updated_at: string } | undefined)?.updated_at ?? null;
  const ageH = (s: string | null) => (s ? (Date.now() - Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')) / 3_600_000 : Infinity);
  const reasons: string[] = [];
  if (n < MIN_OFFERS) reasons.push(`only ${n} active offers`);
  if (ageH(v?.updated_at ?? null) > MAX_AGE_H) reasons.push(`no import for ${MAX_AGE_H} h`);
  if (ageH(smAt) > MAX_AGE_H * 2) reasons.push('sitemaps stale');
  const body = { ok: reasons.length === 0, reasons, active_offers: n, data_version_at: v?.updated_at ?? null, sitemaps_at: smAt };
  return new Response(JSON.stringify(body), { status: body.ok ? 200 : 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
};
