// Copied from apps/kakapo/workers/import (26. 10. 2026) + windows-1250 fallback.
// Streaming XML reader for Workers (no DOM, no XMLReader). Emits one lightweight tree per <item> element
// while discarding everything outside it, so memory stays bounded by the largest item, not the feed.
// Security: DOCTYPE with entities/external ids is rejected (no XXE / billion laughs), only the five predefined
// entities and numeric references are decoded, depth / item size / node count / total bytes are capped.

export interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

export type XmlErrorCode = 'truncated' | 'malformed' | 'limit' | 'doctype' | 'encoding' | 'empty';
export class XmlError extends Error {
  constructor(public code: XmlErrorCode, message: string) { super(message); this.name = 'XmlError'; }
}

export interface XmlLimits {
  maxDepth: number;      // element nesting
  maxItemChars: number;  // characters of one item (tags + text)
  maxItemNodes: number;  // elements inside one item
  maxTotalChars: number; // whole document
}
export const DEFAULT_LIMITS: XmlLimits = { maxDepth: 40, maxItemChars: 4_000_000, maxItemNodes: 50_000, maxTotalChars: 900_000_000 };

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e] ?? m;
  });
}

const local = (n: string): string => { const i = n.indexOf(':'); return i < 0 ? n : n.slice(i + 1); };

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1]!;
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    out[local(name)] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return out;
}

/** End index (exclusive) of a start tag beginning at `from` (`<` position), quote-aware, or -1 when incomplete. */
function tagEnd(buf: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < buf.length; i++) {
    const c = buf[i]!;
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i + 1;
  }
  return -1;
}

export async function* parseXmlItems(chunks: AsyncIterable<string>, itemName: string, limits: XmlLimits = DEFAULT_LIMITS): AsyncGenerator<XmlNode> {
  let buf = '';
  let total = 0;
  const stack: string[] = [];       // local names of all open elements
  const nodes: XmlNode[] = [];      // open nodes inside the current item
  let itemDepth = -1;               // stack.length when the item started (-1 = outside item)
  let itemChars = 0;
  let itemNodeCount = 0;
  let sawRoot = false;

  const inItem = () => itemDepth >= 0;
  const addText = (t: string, raw = false) => {
    if (!inItem() || t === '') return;
    const cur = nodes[nodes.length - 1];
    itemChars += t.length;
    if (itemChars > limits.maxItemChars) throw new XmlError('limit', 'item too large');
    if (cur) cur.text += raw ? t : decodeEntities(t);
  };

  function* consume(final: boolean): Generator<XmlNode> {
    let pos = 0;
    for (;;) {
      const lt = buf.indexOf('<', pos);
      if (lt < 0) {
        // trailing text; keep a possibly split entity for the next chunk
        let tail = buf.slice(pos);
        if (!final) {
          const amp = tail.lastIndexOf('&');
          if (amp >= 0 && !tail.includes(';', amp) && tail.length - amp < 12) { buf = tail.slice(amp); addText(tail.slice(0, amp)); return; }
        } else if (tail.trim() !== '' && stack.length === 0 && sawRoot) {
          throw new XmlError('malformed', 'content after the root element');
        }
        addText(tail);
        buf = '';
        return;
      }
      if (lt > pos) {
        const text = buf.slice(pos, lt);
        if (stack.length === 0 && text.trim() !== '' && !final && !sawRoot) throw new XmlError('malformed', 'text before the root element');
        addText(text);
      }
      pos = lt;
      if (buf.startsWith('<!--', pos)) {
        const e = buf.indexOf('-->', pos + 4);
        if (e < 0) { buf = buf.slice(pos); return; }
        pos = e + 3; continue;
      }
      if (buf.startsWith('<![CDATA[', pos)) {
        const e = buf.indexOf(']]>', pos + 9);
        if (e < 0) { buf = buf.slice(pos); return; }
        addText(buf.slice(pos + 9, e), true);
        pos = e + 3; continue;
      }
      if (buf.startsWith('<?', pos)) {
        const e = buf.indexOf('?>', pos + 2);
        if (e < 0) { buf = buf.slice(pos); return; }
        pos = e + 2; continue;
      }
      if (buf.startsWith('<!', pos)) {
        // DOCTYPE and friends: refuse anything that can declare entities or load external resources
        const e = tagEnd(buf, pos);
        if (e < 0) { if (buf.length - pos > 100_000) throw new XmlError('doctype', 'DOCTYPE too large'); buf = buf.slice(pos); return; }
        const decl = buf.slice(pos, e);
        if (/ENTITY|\[/i.test(decl)) throw new XmlError('doctype', 'DOCTYPE with entity declarations or an internal subset is not allowed'); // external ids (SYSTEM/PUBLIC, e.g. Invia dtd) are never fetched, so they are harmless
        pos = e; continue;
      }
      if (buf[pos + 1] === '/') {
        const e = buf.indexOf('>', pos + 2);
        if (e < 0) { buf = buf.slice(pos); return; }
        const name = local(buf.slice(pos + 2, e).trim());
        const open = stack.pop();
        if (open === undefined || open !== name) throw new XmlError('malformed', `unexpected </${name}>`);
        if (inItem()) {
          const node = nodes.pop()!;
          if (stack.length === itemDepth) { // closed the item element itself
            itemDepth = -1;
            pos = e + 1;
            yield node;
            continue;
          }
        }
        pos = e + 1; continue;
      }
      // start tag
      const e = tagEnd(buf, pos);
      if (e < 0) {
        if (buf.length - pos > 1_000_000) throw new XmlError('limit', 'tag too large');
        buf = buf.slice(pos); return;
      }
      const raw = buf.slice(pos + 1, e - 1);
      const selfClose = raw.endsWith('/');
      const body = selfClose ? raw.slice(0, -1) : raw;
      const nameEnd = body.search(/[\s]/);
      const rawName = (nameEnd < 0 ? body : body.slice(0, nameEnd)).trim();
      if (rawName === '' || /[^\w:.\-]/.test(rawName)) throw new XmlError('malformed', `bad tag name "${rawName.slice(0, 30)}"`);
      const name = local(rawName);
      sawRoot = true;
      if (stack.length + 1 > limits.maxDepth) throw new XmlError('limit', 'nesting too deep');
      if (inItem()) {
        itemChars += e - pos;
        if (++itemNodeCount > limits.maxItemNodes || itemChars > limits.maxItemChars) throw new XmlError('limit', 'item too large');
        const node: XmlNode = { name, attrs: nameEnd < 0 ? {} : parseAttrs(body.slice(nameEnd)), children: [], text: '' };
        nodes[nodes.length - 1]!.children.push(node);
        if (selfClose) { /* leaf without push */ } else { stack.push(name); nodes.push(node); }
      } else if (name === itemName || name.toUpperCase() === itemName.toUpperCase()) {  // Vínokrál writes <shopitem>
        itemChars = e - pos; itemNodeCount = 1;
        const node: XmlNode = { name, attrs: nameEnd < 0 ? {} : parseAttrs(body.slice(nameEnd)), children: [], text: '' };
        if (selfClose) { pos = e; yield node; continue; }
        itemDepth = stack.length; stack.push(name); nodes.push(node);
      } else if (!selfClose) {
        stack.push(name);
      }
      pos = e;
      if (inItem()) { itemChars += 0; }
    }
  }

  for await (const chunk of chunks) {
    total += chunk.length;
    if (total > limits.maxTotalChars) throw new XmlError('limit', 'document exceeds the size limit');
    buf += chunk;
    if (inItem() && buf.length > limits.maxItemChars + 1_000_000) throw new XmlError('limit', 'item too large');
    yield* consume(false);
    // compact: consume() leaves only the unprocessed tail in buf
  }
  yield* consume(true);
  if (!sawRoot) throw new XmlError('empty', 'no XML content');
  if (stack.length > 0) throw new XmlError('truncated', `document ended inside <${stack[stack.length - 1]}>`);
}

/** Decode a byte stream (optionally gzip) into strings, honouring the XML declaration encoding. Invalid bytes throw 'encoding'. */
export async function* decodeXmlStream(body: ReadableStream<Uint8Array>, opts: { maxBytes: number; gzip?: 'auto' | boolean } = { maxBytes: 900_000_000 }): AsyncGenerator<string> {
  let stream = body;
  const [peekable, rest] = [body, null] as const; void rest;
  const reader = peekable.getReader();
  const first = await reader.read();
  if (first.done || !first.value || first.value.length === 0) throw new XmlError('empty', 'empty response body');
  const head = first.value;
  const isGzip = opts.gzip === true || (opts.gzip !== false && head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b);
  // re-assemble a stream: first chunk + remaining reads
  let sent = false;
  const raw = new ReadableStream<Uint8Array>({
    async pull(c) {
      if (!sent) { sent = true; c.enqueue(head); return; }
      const r = await reader.read();
      if (r.done) c.close(); else c.enqueue(r.value);
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  stream = isGzip ? raw.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) : raw;

  let decoder: TextDecoder | null = null;
  let bytes = 0;
  const r2 = stream.getReader();
  let pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  for (;;) {
    const { done, value } = await r2.read();
    if (done) break;
    bytes += value.length;
    if (bytes > opts.maxBytes) throw new XmlError('limit', 'decompressed size limit exceeded');
    if (!decoder) {
      const probe = pending.length ? concat(pending, value) : value;
      if (probe.length < 200 && probe.length < 4) { pending = probe; continue; }
      const headText = new TextDecoder('latin1').decode(probe.subarray(0, 200));
      let enc = /encoding\s*=\s*["']([A-Za-z0-9_\-]+)["']/.exec(headText)?.[1]?.toLowerCase() ?? 'utf-8';
      if (probe[0] === 0xff && probe[1] === 0xfe) enc = 'utf-16le';
      try { decoder = new TextDecoder(enc, { fatal: true }); } catch {
        // workerd's TextDecoder knows only UTF-8/16; some feeds (Flagranti on eroka) send windows-1250
        if (enc === 'windows-1250' || enc === 'cp1250') decoder = new Cp1250Decoder() as unknown as TextDecoder;
        else throw new XmlError('encoding', `unsupported encoding ${enc}`);
      }
      pending = new Uint8Array(0);
      try { const s = decoder.decode(probe, { stream: true }); if (s) yield s; } catch { throw new XmlError('encoding', 'invalid byte sequence for ' + enc); }
      continue;
    }
    try { const s = decoder.decode(value, { stream: true }); if (s) yield s; } catch { throw new XmlError('encoding', 'invalid byte sequence'); }
  }
  if (decoder) { try { const s = decoder.decode(); if (s) yield s; } catch { throw new XmlError('encoding', 'invalid byte sequence at end'); } }
  else if (pending.length) throw new XmlError('truncated', 'body too short');
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }

/** Single-byte windows-1250 decoder (table generated from Python's cp1250 codec). Same decode() shape as TextDecoder. */
const CP1250_HIGH = [8364,65533,8218,65533,8222,8230,8224,8225,65533,8240,352,8249,346,356,381,377,65533,8216,8217,8220,8221,8226,8211,8212,65533,8482,353,8250,347,357,382,378,160,711,728,321,164,260,166,167,168,169,350,171,172,173,174,379,176,177,731,322,180,181,182,183,184,261,351,187,317,733,318,380,340,193,194,258,196,313,262,199,268,201,280,203,282,205,206,270,272,323,327,211,212,336,214,215,344,366,218,368,220,221,354,223,341,225,226,259,228,314,263,231,269,233,281,235,283,237,238,271,273,324,328,243,244,337,246,247,345,367,250,369,252,253,355,729];
export class Cp1250Decoder {
  decode(bytes?: Uint8Array, _opts?: { stream?: boolean }): string {
    if (!bytes) return '';
    let out = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      const part = bytes.subarray(i, i + 8192);
      const codes = new Array<number>(part.length);
      for (let j = 0; j < part.length; j++) { const b = part[j]!; codes[j] = b < 0x80 ? b : CP1250_HIGH[b - 0x80]!; }
      out += String.fromCharCode(...codes);
    }
    return out;
  }
}
