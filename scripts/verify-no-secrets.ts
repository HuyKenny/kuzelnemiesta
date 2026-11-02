/**
 * No secret ends up in the client build (dist/client) or in the server bundle (port of apps/kakapo).
 * Reads the real secret VALUES from the credentials files and searches the build for them — values are never printed.
 * Also flags generic secret-looking patterns (API keys, private keys).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const CRED_DIR = '/home/kenny/ai/credentials';
const FILES = ['.kouzelnydeda-credentials.env', '.cloudflare-credentials.env', '.kuponmat-sk-credentials.env'];
const NON_SECRET = new Set(['INDEXNOW_KEY', 'CJ_CID', 'CJ_CAMPAIGN_ID', 'FTP_ROOT', 'OLD_FTP_HOST', 'OLD_FTP_USER', 'CEDOK_SFTP_HOST', 'CEDOK_SFTP_USER', 'CF_ACCOUNT_ID', 'CF_ZONE_ID', 'CF_EMAIL', 'CF_WORKERS_SUBDOMAIN', 'D1_STAGING_NAME', 'D1_STAGING_ID', 'R2_STAGING_BUCKET', 'ACCESS_TEAM_DOMAIN', 'WP_URL', 'WP_USER', 'FTP_HOST', 'FTP_PORT', 'FTP_USER', 'KM_IMPORT_URL', 'AFFIAL_SHEET_ID', 'EHUB_PUBLISHER_ID', 'CJ_WEBSITE_ID', 'CJ_WEBSITE_ID_SK', 'ESPOLUPRACE_NETWORK_ID', 'D1_PRODUCTION_ID']);

const secrets: Array<{ name: string; value: string }> = [];
for (const f of FILES) {
  const p = join(CRED_DIR, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || NON_SECRET.has(m[1]!)) continue;
    const v = m[2]!.trim().replace(/^["']|["']$/g, '');
    if (v.length >= 8) secrets.push({ name: `${f}:${m[1]}`, value: v });
  }
}
// feed URLs carry tokens (import Worker secrets) — they must never reach the web bundle
const feedsPath = join(CRED_DIR, '.kouzelnydeda-feeds.json');
if (existsSync(feedsPath)) {
  const feeds = JSON.parse(readFileSync(feedsPath, 'utf8')) as Record<string, string>;
  for (const [k, u] of Object.entries(feeds)) if (!k.startsWith('_') && u.includes('auth=')) secrets.push({ name: `.kouzelnydeda-feeds.json:${k}`, value: u.split('auth=')[1]! });
}
const PATTERNS: Array<[string, RegExp]> = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['generic apiKey=', /apiKey=[A-Za-z0-9]{16,}/],
  ['bearer literal', /Bearer [A-Za-z0-9._-]{30,}/],
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|css|html|json|txt|xml|map|svg|webmanifest)$/.test(e)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'dist/client')), ...walk(join(ROOT, 'dist/server'))];
const hits: string[] = [];
for (const f of files) {
  const body = readFileSync(f, 'utf8');
  for (const s of secrets) if (body.includes(s.value)) hits.push(`${f.replace(ROOT, '')}: contains value of ${s.name}`);
  for (const [n, re] of PATTERNS) if (re.test(body)) hits.push(`${f.replace(ROOT, '')}: pattern ${n}`);
}
console.log(`checked ${files.length} build files against ${secrets.length} secret values and ${PATTERNS.length} patterns`);
if (hits.length) {
  console.error('SECRETS FOUND:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('OK — no secrets in the build');
