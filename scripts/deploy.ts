/**
 * Deploy kouzelnydeda to STAGING (production is refused unless KD_PRODUCTION_APPROVED=yes).
 *   tsx scripts/deploy.ts [--env staging|production] [--secrets] [--skip-build] [--no-import]
 * 1) D1 restore point (Time Travel bookmark → backups/, gitignored)  2) migrations  3) import Worker  4) web Worker (+ --secrets)  5) smoke test
 * Routes kouzelnydeda.cz/* are NOT managed here (cutover step, CF API). Rollback: `wrangler rollback --env <env>`.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const envName = argv.includes('--env') ? argv[argv.indexOf('--env') + 1]! : 'staging';
if (envName !== 'staging' && !(envName === 'production' && process.env.KD_PRODUCTION_APPROVED === 'yes')) {
  console.error('Refusing: only staging can be deployed without KD_PRODUCTION_APPROVED=yes.');
  process.exit(1);
}
const NODE = '/home/kenny/.nvm/versions/node/v22.23.1/bin';
const CRED = '/home/kenny/ai/credentials';
function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(CRED, file), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const cf = readEnv('.cloudflare-credentials.env');
const er = readEnv('.kouzelnydeda-credentials.env');
const childEnv = { ...process.env, PATH: `${NODE}:${process.env.PATH}`, CLOUDFLARE_EMAIL: cf.CF_EMAIL, CLOUDFLARE_API_KEY: cf.CF_GLOBAL_API_KEY || cf.CF_API_KEY, CLOUDFLARE_ACCOUNT_ID: er.CF_ACCOUNT_ID };
function run(cmd: string, args: string[], opts: { input?: string; env?: Record<string, string | undefined>; quiet?: boolean } = {}): string {
  if (!opts.quiet) console.log(`$ ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...childEnv, ...(opts.env ?? {}) }, input: opts.input, stdio: ['pipe', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
}
const wr = (args: string[], opts: Parameters<typeof run>[2] = {}) => run(join(NODE, 'node'), [join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), ...args], opts);
const sfx = envName === 'staging' ? '_STAGING' : '_PRODUCTION';
const sha = run('git', ['rev-parse', '--short', 'HEAD'], { quiet: true }).trim();
const siteBase = envName === 'staging' ? 'https://kouzelnydeda-staging.huy-kenny.workers.dev' : 'https://kouzelnydeda.cz';
const base = process.env.SMOKE_BASE ?? (envName === 'staging' ? siteBase : 'https://kouzelnydeda.huy-kenny.workers.dev');

// D1 backup point: `d1 export` refuses databases with virtual tables (FTS5 product_fts), so the deploy records a
// Time Travel bookmark instead (restore: wrangler d1 time-travel restore DB --env <env> --bookmark <b>, 30 days back).
mkdirSync(join(ROOT, 'backups'), { recursive: true });
{
  const info = wr(['d1', 'time-travel', 'info', 'DB', '--env', envName, '--json'], { quiet: true });
  const bookmark = /"bookmark"\s*:\s*"([^"]+)"/.exec(info)?.[1];
  if (!bookmark) throw new Error('could not read the D1 Time Travel bookmark — refusing to deploy without a restore point');
  appendFileSync(join(ROOT, 'backups', `d1-${envName}-bookmarks.log`), `${new Date().toISOString()} ${sha} ${bookmark}\n`);
  console.log(`D1 restore point: ${bookmark}`);
}
wr(['d1', 'migrations', 'apply', 'DB', '--remote', '--env', envName], { input: 'y\n' });
if (!argv.includes('--no-import')) wr(['deploy', '-c', 'workers/import/wrangler.jsonc', '--env', envName]);

let webSecrets: Record<string, string> | null = null;
if (argv.includes('--secrets')) {
  // ACCESS_AUD is optional in production: without it /admin stays closed (the public site does not use Access)
  const w: Record<string, string | undefined> = { IP_HASH_SALT: er[`IP_HASH_SALT${sfx}`], ACCESS_AUD: er[`ACCESS_AUD${sfx}`] };
  const missing = Object.entries(w).filter(([k, v]) => !v && !(k === 'ACCESS_AUD' && envName === 'production')).map(([k]) => k);
  if (missing.length) throw new Error(`missing secret values ${missing.join(', ')}`);
  webSecrets = Object.fromEntries(Object.entries(w).filter(([, v]) => v)) as Record<string, string>;
}
if (!argv.includes('--skip-build')) run(join(NODE, 'npx'), ['astro', 'build'], { env: { CLOUDFLARE_ENV: envName, BUILD_ID: sha, SITE_URL: siteBase } });
run(join(NODE, 'npx'), ['tsx', 'scripts/verify-no-secrets.ts']);
wr(['deploy', '-c', 'dist/server/wrangler.json']);
if (webSecrets) { wr(['secret', 'bulk', '-c', 'dist/server/wrangler.json'], { input: JSON.stringify(webSecrets), quiet: true }); console.log(`web secrets set: ${Object.keys(webSecrets).join(', ')}`); }

// smoke test (staging sits behind Access: service token of the shared "Automated checks" policy)
{
  const sk = readEnv('.kuponmat-sk-credentials.env');
  const h = { 'CF-Access-Client-Id': sk.ACCESS_CLIENT_ID_STAGING ?? '', 'CF-Access-Client-Secret': sk.ACCESS_CLIENT_SECRET_STAGING ?? '' };
  const check = async (path: string, headers: Record<string, string>, expect: number[]) => {
    const r = await fetch(base + path, { headers, redirect: 'manual' });
    const ok = expect.includes(r.status);
    console.log(`${ok ? 'OK ' : 'BAD'} ${r.status} ${path} ${Object.keys(headers).length ? '(service token)' : '(anonymous)'}`);
    return ok;
  };
  await new Promise((r) => setTimeout(r, 5000));
  const results = envName === 'staging'
    ? [await check('/', {}, [302, 401, 403]), await check('/', h, [200]), await check('/zazitky/', h, [200]), await check('/robots.txt', h, [200]), await check('/sitemap_index.xml', h, [200])]
    : [await check('/api/health', {}, [200]), await check('/', {}, [301])];
  if (results.includes(false)) process.exit(2);
}
console.log(`deployed ${envName} @ ${sha}`);
