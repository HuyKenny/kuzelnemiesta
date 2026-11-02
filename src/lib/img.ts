// Offer photos come straight from the partners' feeds (Zlavomat CDN, Adrop) and are resized on the fly by
// wsrv.nl: nothing is stored on Cloudflare (Kenny, 27. 10. 2026: šetřit místo), the 70k WordPress copies are gone.
// Article photos are own static files (/wp-content/uploads/…).
import { HOST } from './site';

/** Feeds sometimes put text or a broken host into the image field. */
export function validImage(url: string | null | undefined): string {
  const u = String(url ?? '').trim().replace(/^http:\/\//i, 'https://');
  return /^https:\/\/[^\s/]+\.[^\s/]+\//i.test(u) ? u : '';
}

/** Photo cropped to w × h (cover), WebP. */
export function crop(url: string | null | undefined, w: number, h: number): string {
  const src = validImage(url);
  if (!src) return '';
  return `https://wsrv.nl/?url=${encodeURIComponent(src.replace(/^https:\/\//, ''))}&w=${w}&h=${h}&fit=cover&a=attention&output=webp&q=76`;
}

/** Card photo (3:2) shown at ~`css` px wide: src + srcset 1×/2×. */
export function card(url: string | null | undefined, css = 320): { src: string; srcset: string } | null {
  const one = crop(url, css, Math.round(css / 1.5));
  if (!one) return null;
  return { src: one, srcset: `${one} 1x, ${crop(url, css * 2, Math.round(css * 2 / 1.5))} 2x` };
}

/** Wide hero photo (2:1) with width descriptors. */
export function hero(url: string | null | undefined): { src: string; srcset: string } | null {
  const mid = crop(url, 960, 480);
  if (!mid) return null;
  return { src: mid, srcset: `${crop(url, 640, 320)} 640w, ${mid} 960w, ${crop(url, 1400, 700)} 1400w` };
}

/** Own uploads as site-relative paths, so every host (staging, workers.dev) serves its own copy. */
const OWN_ORIGIN = new RegExp(`^https?://(www\\.)?${HOST.replace(/\./g, '\\.')}(?=/(wp-content|a)/)`);
export const ownUpload = (u: string | null | undefined) => String(u ?? '').replace(OWN_ORIGIN, '');

/** Same photo in another size/format (feeds repeat the main photo in the gallery, some list every resize). */
const photoKey = (u: string) => decodeURIComponent(u).toLowerCase().split('?')[0]!.replace(/^https?:\/\/(www\.)?/, '').replace(/\/(webp|thumbs?|small|medium|large)\//, '/').replace(/_\d+x\d+(?=\.\w+$)/, '').replace(/\.(webp|jpe?g|png)$/, '');
export function uniquePhotos(main: string, more: string[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [main, ...more]) {
    const k = u ? photoKey(u) : '';
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(u);
  }
  return out.slice(0, max);
}
