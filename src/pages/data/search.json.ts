// /data/search.json — search corpus (lib/staticdata.ts). The static build splits it into /data/s/<xx>.json and never deploys it.
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { searchData } from '../../lib/staticdata';

export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await searchData(getEnv().DB)), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
