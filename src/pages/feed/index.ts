// RSS of the latest posts (WordPress /feed/).
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { decode, esc, stripTags } from '../../lib/format';

export const prerender = false;
const rfc822 = (local: string) => new Date(local.replace(' ', 'T') + '+01:00').toUTCString().replace('GMT', '+0000');
export const GET: APIRoute = async () => {
  const rows = (await getEnv().DB.prepare("SELECT slug, title, excerpt, published_at FROM posts WHERE type = 'post' AND status = 'publish' ORDER BY published_at DESC LIMIT 10")
    .all<{ slug: string; title: string; excerpt: string; published_at: string }>()).results;
  const items = rows.map((r) => `<item><title>${esc(decode(r.title))}</title><link>https://kouzelnydeda.cz/${r.slug}/</link><guid isPermaLink="true">https://kouzelnydeda.cz/${r.slug}/</guid><pubDate>${rfc822(r.published_at)}</pubDate><description>${esc(stripTags(r.excerpt))}</description></item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Kouzelný děda</title><link>https://kouzelnydeda.cz/</link><description>Vyhledávač pobytů a dovolené</description><language>cs</language>\n${items}\n</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=UTF-8' } });
};
