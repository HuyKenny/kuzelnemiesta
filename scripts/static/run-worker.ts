/**
 * Nightly import for the static site (Cloudflare Workers Free, 2026-11): runs the deleted import Worker (workers/import) in Node
 * over the local SQLite state. Shared by alkoholicky, eroka, kouzelnydeda and kuzelnemiesta (master copy:
 * ~/ai/scripts/cloudflare-free/shop-static/).
 *
 *   tsx scripts/static/run-worker.ts --db <sqlite> [--serve <port>] [--run "<shell command>"]… [--tick] [--finalize]
 *
 * --serve   the Worker's fetch handler on http://127.0.0.1:<port> while the --run commands execute (Malina scripts that used to
 *           call the Worker's HTTP API, e.g. /ingest/<feed>, /recompute, /finalize). They get IMPORT_BASE + IMPORT_SHARED_SECRET.
 * --run     a shell command (in the app dir), repeatable, run in order; STATIC_DB points at the SQLite file (scripts that wrote
 *           D1 through `wrangler d1 execute --remote` write it directly, see scripts/static/d1local.py).
 * --tick    the cron tick until every due feed ran (tick() of workers/import/src/index.ts).
 * --finalize  finalizeDay() afterwards even if the tick said "idle" (some ticks finalise only after 03:00 UTC).
 * Feed URLs: secret FEED_URLS_JSON {"FEED_URL_<n>": "https://…"}; the vars come from workers/import/wrangler.jsonc (production).
 * Prints counts only (public Actions logs).
 */
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const APP = new URL('../../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const all = (k: string) => argv.flatMap((x, i) => (x === k ? [argv[i + 1]!] : []));
const file = arg('--db');
if (!file || !existsSync(file)) throw new Error('usage: run-worker.ts --db <sqlite> [--serve port] [--run cmd]… [--tick] [--finalize]');

// ---------- D1 over node:sqlite ----------
type Row = Record<string, unknown>;
const raw = new DatabaseSync(file);
raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = OFF;');
const norm = (v: unknown[]) => v.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)) as never[];
class Stmt {
  constructor(readonly sql: string, readonly params: unknown[] = []) {}
  bind(...v: unknown[]) { return new Stmt(this.sql, v); }
  private st() { return raw.prepare(this.sql); }
  async all<T = Row>() { const s = this.st(); return { results: (s.columns().length ? s.all(...norm(this.params)) : (s.run(...norm(this.params)), [])) as T[], success: true, meta: {} }; }
  async first<T = Row>(col?: string) { const r = this.st().get(...norm(this.params)) as Row | undefined; return (r ? (col ? r[col] : r) : null) as T | null; }
  async raw<T = unknown[]>() { const s = this.st(); s.setReturnArrays?.(true); return s.all(...norm(this.params)) as T[]; }
  async run() { const s = this.st(); if (s.columns().length) { const rows = s.all(...norm(this.params)); return { results: rows, success: true, meta: { changes: 0 } }; } const r = s.run(...norm(this.params)); return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), rows_written: Number(r.changes) } }; }
}
const DB = {
  prepare: (sql: string) => new Stmt(sql),
  async batch(stmts: Stmt[]) {
    raw.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); raw.exec('COMMIT'); return out; }
    catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
  async exec(sql: string) { raw.exec(sql); return { count: 1, duration: 0 }; },
  async dump() { throw new Error('dump not supported'); },
};

// ---------- R2 (FEED_MIRROR) on disk: <state dir>/r2/<key> ----------
function dirR2(root: string) {
  const p = (k: string) => join(root, k);
  const obj = (k: string) => { const b = readFileSync(p(k)); const st = statSync(p(k)); return { key: k, size: b.length, etag: `${st.mtimeMs}-${b.length}`, httpEtag: `"${st.mtimeMs}-${b.length}"`, uploaded: st.mtime, body: new Response(b).body!, text: async () => b.toString('utf8'), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b.toString('utf8')) }; };
  return {
    async head(k: string) { return existsSync(p(k)) ? obj(k) : null; },
    async get(k: string) { return existsSync(p(k)) ? obj(k) : null; },
    async put(k: string, v: string | Uint8Array | ArrayBuffer) { mkdirSync(dirname(p(k)), { recursive: true }); writeFileSync(p(k), typeof v === 'string' ? v : new Uint8Array(v as ArrayBuffer)); return null; },
    async delete(k: string | string[]) { for (const x of Array.isArray(k) ? k : [k]) rmSync(p(x), { force: true }); },
    async list({ prefix = '' } = {}) { const out: string[] = []; const walk = (d: string, pre: string) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const q = join(d, f); if (statSync(q).isDirectory()) walk(q, pre + f + '/'); else out.push(pre + f); } }; walk(root, ''); return { objects: out.filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: statSync(p(key)).size, uploaded: statSync(p(key)).mtime })), truncated: false }; },
  };
}

// ---------- env ----------
function jsonc(path: string) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
}
const cfg = jsonc(join(APP, 'workers/import/wrangler.jsonc'));
const vars: Record<string, string> = { ...(cfg.vars ?? {}), ...(cfg.env?.production?.vars ?? {}) };
const secret = randomBytes(24).toString('hex');
const env: Record<string, unknown> = { ...vars, DB, IMPORT_SHARED_SECRET: secret, MAX_WRITES: '100000000' };
for (const b of [...(cfg.r2_buckets ?? []), ...(cfg.env?.production?.r2_buckets ?? [])]) env[b.binding] = dirR2(join(dirname(file), 'r2', b.bucket_name));
let nFeeds = 0;
if (process.env.FEED_URLS_JSON) {
  try { for (const [k, v] of Object.entries(JSON.parse(process.env.FEED_URLS_JSON) as Record<string, string>)) if (/^FEED_URL_[A-Z0-9_]+$/.test(k) && v) { env[k] = v; nFeeds++; } }
  catch { console.log('FEED_URLS_JSON is not valid JSON - ignored'); }
}
for (const [k, v] of Object.entries(process.env)) if (v && /^(FEED_URL_[A-Z0-9_]+|CJ_[A-Z_]+|EHUB_[A-Z_]+|DOGNET_[A-Z_]+)$/.test(k) && !(k in env)) env[k] = v;
// feeds mirrored on Malina (hosts that refuse datacenter IPs, e.g. Affiliateport 403): $MIRROR_DIR/feed-<n>.xml -> the
// FEED_MIRROR bucket on disk, FEED_URL_<n> = r2:feed-<n>.xml (the engine's openMirror path, as on Cloudflare)
const mirrorBucket = [...(cfg.r2_buckets ?? []), ...(cfg.env?.production?.r2_buckets ?? [])].find((b: { binding: string }) => b.binding === 'FEED_MIRROR');
if (process.env.MIRROR_DIR && existsSync(process.env.MIRROR_DIR) && mirrorBucket) {
  for (const f of readdirSync(process.env.MIRROR_DIR)) {
    const m = /^feed-(\d+)\.xml$/.exec(f);
    if (!m) continue;
    const dst = join(dirname(file), 'r2', mirrorBucket.bucket_name, f);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(join(process.env.MIRROR_DIR, f)));
    env[`FEED_URL_${m[1]}`] = `r2:${f}`;
    console.log(`feed ${m[1]}: Malina mirror (${Math.round(statSync(dst).size / 1e6)} MB)`);
  }
}
console.log(`env: ${nFeeds} feed URLs, vars ${Object.keys(vars).join(',')}`);

const worker = await import(join(APP, 'workers/import/src/index.ts'));
const engine = await import(join(APP, 'workers/import/src/engine.ts')).catch(() => ({} as Record<string, unknown>));
const ctx = { waitUntil: (p: Promise<unknown>) => { void p.catch(() => {}); }, passThroughOnException: () => {} };

const summarize = (r: unknown) => JSON.stringify(r, (k, v) => (typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v)).slice(0, 600);

let server: ReturnType<typeof createServer> | null = null;
const port = Number(arg('--serve') ?? 0);
if (port) {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const r: Response = await worker.default.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }), env, ctx);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'error' }));
    }
  });
  await new Promise<void>((ok) => server!.listen(port, '127.0.0.1', ok));
}

const t0 = Date.now();
for (const cmd of all('--run')) {
  const t = Date.now();
  try {
    // async server in this process: run the command in a child shell without blocking the event loop
    await new Promise<void>((ok, bad) => {
      const p = spawn('bash', ['-c', cmd], { cwd: APP, stdio: 'inherit', env: { ...process.env, STATIC_DB: file, IMPORT_BASE: `http://127.0.0.1:${port}`, IMPORT_SHARED_SECRET: secret } });
      p.on('exit', (code) => (code === 0 ? ok() : bad(new Error(`exit ${code}`))));
    });
    console.log(`run ok (${Math.round((Date.now() - t) / 1000)} s): ${cmd.split(' ').slice(0, 3).join(' ')}`);
  } catch (e) {
    console.log(`run FAILED (${e instanceof Error ? e.message : 'error'}): ${cmd.split(' ').slice(0, 3).join(' ')}`);
  }
}

if (argv.includes('--tick')) {
  for (let i = 0; i < 80; i++) {
    const r = await worker.tick(env) as Record<string, unknown>;
    console.log('tick:', summarize(r));
    if (!r || !('feed' in r)) break;
  }
}
if (argv.includes('--finalize') && typeof engine.finalizeDay === 'function') {
  const r = await (engine.finalizeDay as (e: unknown, f?: boolean) => Promise<unknown>)(env, true);
  console.log('finalize:', summarize(r));
}
server?.close();
raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
raw.close();
console.log(`import done in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(0);
