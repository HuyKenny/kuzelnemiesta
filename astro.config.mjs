// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://kuzelnemiesta.sk',
  // The offer catalogue renders on demand from D1: a price change never needs a rebuild.
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  // WordPress URL shape (/<slug>/ with a trailing slash); canonicalisation lives in the middleware.
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'always' },
  security: { checkOrigin: false },
  vite: {
    build: { assetsInlineLimit: 0 },
    // Part of every edge-cache key: a deploy never serves HTML rendered by the previous build.
    define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? String(Date.now())) },
  },
});
