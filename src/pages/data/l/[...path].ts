// /data/l/<listing path>.json — listing data for the client-side sort/filters (lib/staticdata.ts).
// Rendered only by the nightly static build (local SSR); the live site serves the frozen files.
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/server/env';
import { listingData } from '../../../lib/staticdata';

export const prerender = false;
export const GET: APIRoute = async ({ params }) => {
  const m = /^([^.]+(?:\/[^.]+)*)\.json$/.exec(params.path ?? '');
  const data = m ? await listingData(getEnv().DB, m[1]!) : null;
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
