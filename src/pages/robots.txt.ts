import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';
import { BASE } from '../lib/site';

export const prerender = false;
// Production robots.txt (30. 10. 2026, Astro): no Crawl-delay (pages come from the edge cache, not the shared WEDOS
// origin). SEO link crawlers (Ahrefs, Semrush, Majestic) are ALLOWED again — partners who buy an article check their
// link with them; WordPress blocked them and the checks said "no dofollow". Crawlers without any benefit stay blocked.
const PROD = `User-agent: *
Disallow: /go/
Disallow: /api/
Disallow: /data/
Disallow: /*?*orderby=
Disallow: /*?*min_price=
Disallow: /*?*max_price=
Disallow: /*?*partner=
Disallow: /*?*add-to-cart=

${['Baiduspider', 'DotBot', 'PetalBot', 'BLEXBot'].map((b) => `User-agent: ${b}\nDisallow: /\n`).join('\n')}
Sitemap: ${BASE}/sitemap_index.xml
`;
export const GET: APIRoute = () => {
  const prod = getEnv().ENVIRONMENT === 'production';
  return new Response(prod ? PROD : 'User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'public, max-age=3600' } });
};
