// Guarded feed download (port of apps/kakapo/workers/import/src/adapters/http.ts): https only, host allow-list on
// every redirect hop, conditional requests, timeout + bounded retry. URLs carry tokens: never logged.
export class FeedFetchError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); this.name = 'FeedFetchError'; }
}

export function hostAllowed(host: string, list: string | undefined): boolean {
  const h = host.toLowerCase();
  if (!list) return false;
  return list.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).some((rule) =>
    rule.startsWith('*.') ? h.endsWith(rule.slice(1)) && h.length > rule.length - 1 : h === rule);
}

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;
function checkUrl(u: URL, allowed: string | undefined) {
  if (u.protocol !== 'https:') throw new FeedFetchError('feed host must use https', false);
  if (PRIVATE.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) throw new FeedFetchError('feed host is not a public name', false);
  if (!hostAllowed(u.hostname, allowed)) throw new FeedFetchError(`host ${u.hostname} is not on the allow-list`, false);
}

export type OpenResult = { status: 'not_modified' } | { status: 'ok'; body: ReadableStream<Uint8Array>; etag: string | null; lastModified: string | null };

export async function openFeed(url: string, allowed: string | undefined, cond: { etag?: string | null; lastModified?: string | null }, attempts = 3): Promise<OpenResult> {
  let last: unknown;
  for (let a = 1; a <= attempts; a++) {
    try { return await once(url, allowed, cond); }
    catch (e) {
      last = e;
      if (e instanceof FeedFetchError && !e.retryable) throw e;
      if (a < attempts) await new Promise((r) => setTimeout(r, 1000 * 2 ** (a - 1)));
    }
  }
  throw last instanceof FeedFetchError ? last : new FeedFetchError('download failed after retries', false);
}

async function once(start: string, allowed: string | undefined, cond: { etag?: string | null; lastModified?: string | null }): Promise<OpenResult> {
  let u: URL;
  try { u = new URL(start); } catch { throw new FeedFetchError('feed URL is invalid', false); }
  if (u.protocol === 'http:') u.protocol = 'https:';
  const headers: Record<string, string> = { 'User-Agent': 'KuzelneMiestaFeedImporter/1.0 (+https://kuzelnemiesta.sk)', 'Accept-Encoding': 'gzip' };
  if (cond.etag) headers['If-None-Match'] = cond.etag;
  if (cond.lastModified) headers['If-Modified-Since'] = cond.lastModified;
  const signal = AbortSignal.timeout(240_000);
  for (let hop = 0; hop <= 5; hop++) {
    checkUrl(u, allowed);
    let res: Response;
    try { res = await fetch(u.toString(), { headers, redirect: 'manual', signal }); }
    catch { throw new FeedFetchError('network error or timeout', true); }
    if (res.status === 304) return { status: 'not_modified' };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new FeedFetchError(`redirect without location (HTTP ${res.status})`, false);
      try { u = new URL(loc, u); } catch { throw new FeedFetchError('redirect target is invalid', false); }
      continue;
    }
    if (res.status === 429 || res.status >= 500) throw new FeedFetchError(`HTTP ${res.status}`, true);
    if (!res.ok || !res.body) throw new FeedFetchError(`HTTP ${res.status}`, false);
    return { status: 'ok', body: res.body, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
  }
  throw new FeedFetchError('too many redirects', false);
}

/** Feed mirrored to R2 by the Pi (bin/alkoholicky-feed-mirror.py) for hosts that refuse Cloudflare's egress (Affiliateport
 *  answers Workers with 403). `r2:<key>` secrets point here; the R2 etag plays the conditional request. */
export async function openMirror(bucket: R2Bucket | undefined, key: string, etag: string | null | undefined, maxAgeH = 36): Promise<OpenResult> {
  if (!bucket) throw new FeedFetchError('FEED_MIRROR binding missing', false);
  const head = await bucket.head(key);
  if (!head) throw new FeedFetchError('mirror object missing', false);
  if (Date.now() - head.uploaded.getTime() > maxAgeH * 3600_000) throw new FeedFetchError(`mirror older than ${maxAgeH} h`, false);
  if (etag && head.etag === etag) return { status: 'not_modified' };
  const obj = await bucket.get(key);
  if (!obj) throw new FeedFetchError('mirror object missing', false);
  return { status: 'ok', body: obj.body, etag: obj.etag, lastModified: obj.uploaded.toUTCString() };
}
