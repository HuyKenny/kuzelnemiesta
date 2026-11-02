// Rank Math sitemap files: post-, page-, category-, product-sitemapN, product_cat-sitemapN, store-, pa_lokalita-sitemap.xml
// — served from site_cache (lib/sitemap.ts).
import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';
import { siteCache } from '../lib/db';

export const prerender = false;
const NAME = /^(post-sitemap|page-sitemap|category-sitemap|product-sitemap\d*|product_cat-sitemap\d*|store-sitemap|pa_lokalita-sitemap)$/;
export const GET: APIRoute = async ({ params }) => {
  const name = String(params.sitemap ?? '');
  const xml = NAME.test(name) ? await siteCache(getEnv().DB, `sitemap:${name}`) : null;
  // a numbered file of a type that now fits in one file (product_cat-sitemap1 → product_cat-sitemap) → 301
  if (!xml && /\d$/.test(name) && (await siteCache(getEnv().DB, `sitemap:${name.replace(/\d+$/, '')}`))) {
    return new Response(null, { status: 301, headers: { location: `/${name.replace(/\d+$/, '')}.xml` } });
  }
  // numbered files the catalogue no longer needs are gone for good → 410, so GSC drops them
  if (!xml) return new Response('Gone', { status: NAME.test(name) && /\d$/.test(name) ? 410 : 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=UTF-8', 'x-robots-tag': 'noindex, follow' } });
};
