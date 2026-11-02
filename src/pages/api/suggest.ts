// GET /api/suggest?q= — search box suggestions: categories by name (memoised tree) + up to 6 active offers (FTS5).
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { search, tree } from '../../lib/db';
import { cena, decode } from '../../lib/format';

export const prerender = false;
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const GET: APIRoute = async ({ url, request }) => {
  const env = getEnv();
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600', 'x-robots-tag': 'noindex' };
  if (q.length < 2) return new Response('{"cats":[],"offers":[]}', { headers });
  if (env.RL_SEARCH && !(await env.RL_SEARCH.limit({ key: request.headers.get('cf-connecting-ip') ?? '0' })).success) return new Response('{"cats":[],"offers":[]}', { status: 429, headers });
  const t = await tree(env.DB);
  const f = fold(q);
  const cats = [...t.byId.values()].filter((c) => c.count_total > 0 && !c.noindex && !c.canon_id && fold(c.name).includes(f))
    .sort((a, b) => b.count_total - a.count_total).slice(0, 5).map((c) => ({ u: `/${c.slug}/`, n: decode(c.name), c: c.count_total }));
  const { items } = await search(env.DB, q, 1);
  const offers = items.slice(0, 6).map((p) => ({ u: `/${p.slug}/`, n: decode(p.name), p: cena(p.price) }));
  return new Response(JSON.stringify({ cats, offers }), { headers });
};
