import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';
import { siteCache } from '../lib/db';
import { rebuildSitemaps } from '../lib/sitemap';

export const prerender = false;
export const GET: APIRoute = async () => {
  const db = getEnv().DB;
  let xml = await siteCache(db, 'sitemap:index');
  if (!xml) { await rebuildSitemaps(db); xml = await siteCache(db, 'sitemap:index'); }
  return new Response(xml ?? '', { headers: { 'content-type': 'application/xml; charset=UTF-8', 'x-robots-tag': 'noindex, follow' } });
};
