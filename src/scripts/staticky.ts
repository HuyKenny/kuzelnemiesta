// Client-side listing sort/filters and offer search for the static site (Cloudflare Workers Free, 24. 11. 2026: every page is
// a static file and the assets ignore query strings). Loaded on demand by ui.ts — only when a listing URL carries a sort/filter,
// on the search page, or when somebody types into the search box. Data: lib/staticdata.ts (built nightly). The markup mirrors
// components/Karta.astro, Strankovani.astro, Sidebar.astro, stranky/Vypis.astro and stranky/Hledani.astro.
// Pagination of sorted/filtered lists and search results uses ?strana=N (the static /page/N/ files exist only for the default
// order); the canonical of the static page stays the clean URL.
const PER_PAGE = 24;
const NBSP = ' ';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const cislo = (n: number) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
/** lib/format.ts cena(): "24,90 €", whole amounts without cents, "1 290 €". */
const cena = (n: number) => { const c = Math.round((Number(n) || 0) * 100); const f = Math.abs(c % 100); return (f ? `${cislo(Math.trunc(c / 100))},${String(f).padStart(2, '0')}` : cislo(Math.trunc(c / 100))) + NBSP + '€'; };
const ponuk = (n: number) => (n === 1 ? 'ponuka' : n >= 2 && n <= 4 ? 'ponuky' : 'ponúk');
const ik = (n: string) => `<svg class="ik" aria-hidden="true" focusable="false"><use href="/a/i3.svg#${n}"></use></svg>`;
/** Same as lib/staticdata.ts fold(). */
export const fold = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const getJson = async <T>(u: string): Promise<T> => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() as Promise<T>; };
const nabidek = (n: number) => `${cislo(n)} ${ponuk(n)}`;

// ---------- card + pagination ----------
/** [id, slug, name, photo, price, old price, discount, partner, place, rating, reviews, deal end, bought, created (unix s)] */
type Row = [number, string, string, string, number, number, number, number, string, number, number, string, number, number];
type Partner = [string, string, string, number];
const dniDo = (date: string): number | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const d = Math.ceil((Date.parse(date.slice(0, 10) + 'T23:59:59Z') - Date.now()) / 86400_000);
  return d >= 0 ? d : null;
};
const dni = (n: number) => (n === 0 ? 'dnes' : n === 1 ? 'zajtra' : n <= 4 ? `o ${n} dni` : `o ${n} dní`);
/** 2× photo of a 1× one (lib/img.ts card(…, 360): 360 × 240 → 720 × 480). */
const x2 = (s: string) => s.replace('&w=360&h=240&', '&w=720&h=480&');
function karta(r: Row, i: number, ps: Partner[], ip: [string, string], sec: string): string {
  const [id, slug, name, s0, price, old, disc, pi, where, rating, reviews, end, bought, created] = r;
  const [pslug, pname, color, unit] = ps[pi] ?? ['', '', '', 0];
  const src = s0 ? ip[0] + s0 + ip[1] : '';
  const ctx = sec ? `karta-${sec}` : 'karta';
  const left = dniDo(end);
  const fresh = Date.now() - created * 1000 < 3 * 86400_000;
  const badge: [string, string] | null = left !== null && left <= 7 ? ['hodiny', `Končí ${dni(left)}`] : bought && bought >= 50 ? ['lidi', `${cislo(bought)}× kúpené`] : fresh ? ['jiskra', 'Novinka'] : null;
  return `<li><article class="k"><div class="fo">`
    + (src ? `<img src="${esc(src)}" srcset="${esc(src)} 1x, ${esc(x2(src))} 2x" alt="${esc(name)}" width="360" height="270" loading="${i < 3 ? 'eager' : 'lazy'}"${i === 0 ? ' fetchpriority="high"' : ''} decoding="async">` : '')
    + (badge ? `<span class="k__badge">${ik(badge[0])}${esc(badge[1])}</span>` : '')
    + `<p class="k__p num"><span class="k__cena">${cena(price)}${unit ? '<small>/ noc</small>' : ''}${old > price ? `<del>${cena(old)}</del>` : ''}</span>${disc >= 5 ? `<span class="k__sleva">−${disc} %</span>` : ''}</p></div>`
    + `<div class="k__b"><h3 class="k__n"><a href="/${esc(slug)}/">${esc(name)}</a></h3>`
    + (rating > 0 && reviews > 0 ? `<p class="k__r">${ik('hvezda')}<b>${String(rating).replace('.', ',')}</b> / 5 <span>(${cislo(reviews)} hodnotení)</span></p>` : '')
    + `<p class="k__m">${pname ? `<span class="pt" style="--c:${esc(color)}">${esc(pname)}</span>` : ''}${where ? `<span>${esc(where)}</span>` : ''}</p></div>`
    + `<a class="k__go" href="/go/${id}/?ctx=${esc(ctx)}" target="_blank" rel="nofollow sponsored noopener" data-partner="${esc(pslug)}" data-id="${id}" data-name="${esc(name)}"${sec ? ` data-section="${esc(sec)}"` : ''} data-price="${Math.round(price * 100) / 100}" aria-label="${esc(name)} – k ponuke u partnera">K ponuke ${ik('sipka')}</a>`
    + `</article></li>`;
}
const mrizka = (rows: Row[], ps: Partner[], ip: [string, string], sec = '') => `<ul class="grid">${rows.map((r, i) => karta(r, i, ps, ip, sec)).join('')}</ul>`;
function strankovani(url: (n: number) => string, page: number, pages: number): string {
  if (pages <= 1) return '';
  const show = new Set<number>();
  for (let i = 1; i <= Math.min(3, pages); i++) show.add(i);
  for (let i = Math.max(1, pages - 2); i <= pages; i++) show.add(i);
  for (let i = Math.max(1, page - 3); i <= Math.min(pages, page + 3); i++) show.add(i);
  const list = [...show].sort((a, b) => a - b);
  let h = '';
  if (page > 1) h += `<li><a href="${esc(url(page - 1))}" rel="prev" aria-label="Predchádzajúca strana">←</a></li>`;
  list.forEach((n, i) => {
    if (i && n - list[i - 1]! > 1) h += '<li><span>…</span></li>';
    h += n === page ? `<li><span aria-current="page">${n}</span></li>` : `<li><a href="${esc(url(n))}" aria-label="Strana ${n}">${n}</a></li>`;
  });
  if (page < pages) h += `<li><a href="${esc(url(page + 1))}" rel="next" aria-label="Ďalšia strana">→</a></li>`;
  return `<nav class="str" aria-label="Stránkovanie"><ul>${h}</ul></nav>`;
}
const strana = (sp: URLSearchParams) => Math.max(1, parseInt(sp.get('strana') ?? '', 10) || 1);

// ---------- listing (lib/filters.ts) ----------
type Sort = 'pop' | 'price' | 'price-desc' | 'date' | 'disc';
const ALIAS: Record<string, Sort> = { popularity: 'pop', rating: 'pop', menu_order: 'pop', pop: 'pop', date: 'date', price: 'price', 'price-desc': 'price-desc', disc: 'disc' };
interface F { sort: Sort; min?: number | undefined; max?: number | undefined; partner: string }
interface ListData { n: number; s: Partner[]; ip: [string, string]; o: Record<string, number[]>; c: Row[] }
function parse(sp: URLSearchParams): F {
  const num = (k: string) => { const v = sp.get(k); if (v === null || v.trim() === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined; };
  const partner = (sp.get('partner') ?? '').toLowerCase();
  return { sort: ALIAS[sp.get('orderby') ?? ''] ?? 'pop', min: num('min_price'), max: num('max_price'), partner: /^[a-z0-9-]{3,40}$/.test(partner) ? partner : '' };
}
function toQuery(f: F): string {
  const sp = new URLSearchParams();
  if (f.sort !== 'pop') sp.set('orderby', f.sort);
  if (f.min !== undefined) sp.set('min_price', String(f.min));
  if (f.max !== undefined) sp.set('max_price', String(f.max));
  if (f.partner) sp.set('partner', f.partner);
  const s = sp.toString();
  return s ? '?' + s : '';
}

export async function vypis(vy: HTMLElement): Promise<void> {
  const sp = new URLSearchParams(location.search);
  const main = vy.querySelector<HTMLElement>('.vy__m');
  if (!main) return;
  main.style.opacity = '.45';
  let d: ListData;
  try { d = await getJson<ListData>(vy.dataset.src!); } catch { main.style.opacity = ''; return; }
  const f = parse(sp);
  const isStore = location.pathname.startsWith('/brand/');
  if (isStore) f.partner = '';
  const base = vy.dataset.base ?? location.pathname.replace(/page\/\d+\/$/, '');
  const pathPage = /\/page\/(\d+)\/$/.exec(location.pathname);
  const rows = (d.o[f.sort] ?? d.o.pop ?? []).map((i) => d.c[i]!).filter((r) =>
    (f.min === undefined || r[4] >= f.min) && (f.max === undefined || r[4] <= f.max) && (!f.partner || d.s[r[7]]?.[0] === f.partner));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, sp.has('strana') ? strana(sp) : pathPage ? Number(pathPage[1]) : 1);
  const url = (x: Partial<F>) => base + toQuery({ ...f, ...x });
  const qs = toQuery(f);
  // texts shown only on the plain first page
  if (qs) document.querySelectorAll<HTMLElement>('.vh .lead, .vh .vice, .kat-text').forEach((e) => { e.hidden = true; });
  // as the old SSR (lib/filters.ts): a filtered / re-sorted state is noindex, follow; the static canonical stays the clean URL
  if (qs) document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
  const h2 = main.querySelector<HTMLElement>('form.tb h2[data-n]');
  if (h2) h2.textContent = nabidek(total);
  // toolbar: sort select + hidden filters (ui.ts submits the form on change), active filter chips
  const tb = main.querySelector<HTMLFormElement>('form.tb');
  if (tb) {
    const sel = tb.querySelector('select[name="orderby"]') as HTMLSelectElement | null;
    if (sel) sel.value = f.sort;
    const box = tb.querySelector('.tb__f') ?? tb;
    const hidden = (name: string, v: string) => {
      let i = tb.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
      if (!v) { i?.remove(); return; }
      if (!i) { i = document.createElement('input'); i.type = 'hidden'; i.name = name; box.appendChild(i); }
      i.value = v;
    };
    hidden('max_price', f.max !== undefined ? String(f.max) : '');
    hidden('min_price', f.min !== undefined ? String(f.min) : '');
    hidden('partner', f.partner);
    tb.querySelector('ul.tb__a')?.remove();
    const active: Array<[string, string]> = [];
    if (f.max !== undefined || f.min !== undefined) active.push([f.max !== undefined ? `do ${cena(f.max)}` : `od ${cena(f.min!)}`, url({ max: undefined, min: undefined })]);
    const st = f.partner ? d.s.find((x) => x[0] === f.partner) : undefined;
    if (st) active.push([st[1], url({ partner: '' })]);
    if (active.length) tb.querySelector('h2')?.insertAdjacentHTML('afterend', `<ul class="tb__a">${active.map(([l, u]) => `<li><a href="${esc(u)}" rel="nofollow" aria-label="Zrušiť filter ${esc(l)}">${esc(l)} ${ik('zavrit')}</a></li>`).join('')}</ul>`);
  }
  // sidebar: budget and partner links keep the other filters (Sidebar.astro)
  const lists = [...vy.querySelectorAll<HTMLUListElement>('aside.sb ul.sb__r')];
  for (const [li, ul] of lists.entries()) {
    for (const a of ul.querySelectorAll<HTMLAnchorElement>('a')) {
      const own = new URL(a.getAttribute('href') ?? '', location.origin).searchParams;
      if (li === 0) {
        const m = own.get('max_price') ? Number(own.get('max_price')) : undefined;
        a.href = url({ max: m, min: undefined });
        if (f.max === m && f.min === undefined) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      } else {
        const p = own.get('partner') ?? '';
        a.href = url({ partner: p });
        if (f.partner === p) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
      a.dataset.own = own.toString();
    }
  }
  // grid + pagination (?strana=N on top of the filter query)
  main.querySelectorAll(':scope > ul.grid, :scope > nav.str, :scope > p.prazdne').forEach((e) => e.remove());
  const pageUrl = (k: number) => base + qs + (k > 1 ? (qs ? '&' : '?') + 'strana=' + k : '');
  main.insertAdjacentHTML('beforeend', total > 0
    ? mrizka(rows.slice((page - 1) * PER_PAGE, page * PER_PAGE), d.s, d.ip, vy.dataset.sec ?? '') + strankovani(pageUrl, page, pages)
    : '<p class="prazdne">Momentálne tu nie sú žiadne ponuky. Skúste iný rozpočet alebo <a href="/">úvodnú stránku</a>.</p>');
  main.style.opacity = '';
}

// ---------- search (/data/s/*, built from /data/search.json by scripts/static/build.py) ----------
interface SearchIndex { meta: { s: Partner[]; ip: [string, string]; cats: Array<[string, string, number]> }; n: Record<string, number> }
type SRow = [string, ...Row];
let indexP: Promise<SearchIndex> | null = null;
const bucketP = new Map<string, Promise<SRow[]>>();
const loadIndex = () => (indexP ??= getJson<SearchIndex>('/data/s/index.json').catch((e) => { indexP = null; throw e; }));
const loadBucket = (k: string) => { let p = bucketP.get(k); if (!p) { p = getJson<SRow[]>(`/data/s/${k}.json`).catch((e) => { bucketP.delete(k); throw e; }); bucketP.set(k, p); } return p; };

export interface Found { rows: Row[]; cats: Array<[string, string, number]>; ps: Partner[]; ip: [string, string] }
/** Every typed word (2+ letters) must start a word of the offer name or its place, diacritics-insensitive (the old FTS5 prefix
 *  query); whole-word hits and a matching first word rank higher, then the listing order. Categories: the whole phrase inside the name. */
export async function search(q: string): Promise<Found> {
  const ix = await loadIndex();
  const words = [...new Set(fold(q).split(' ').filter((w) => w.length > 1))].slice(0, 6);
  const phrase = fold(q);
  const cats = phrase ? ix.meta.cats.filter(([n]) => fold(n).includes(phrase)) : [];
  if (!words.length) return { rows: [], cats, ps: ix.meta.s, ip: ix.meta.ip };
  let key = '', size = Infinity;
  for (const w of words) { const n = ix.n[w.slice(0, 2)] ?? 0; if (n < size) { size = n; key = w.slice(0, 2); } }
  const cand = size > 0 ? await loadBucket(key) : [];
  const scored: Array<[number, number, Row]> = [];
  cand.forEach((r, i) => {
    const tw = r[0].split(' ');
    let s = 0;
    for (const w of words) {
      if (tw.includes(w)) s += 3;
      else if (tw.some((x) => x.startsWith(w))) s += 1;
      else return;
    }
    if (tw[0]?.startsWith(words[0]!)) s += 1;
    scored.push([s, i, r.slice(1) as unknown as Row]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return { rows: scored.map((x) => x[2]), cats, ps: ix.meta.s, ip: ix.meta.ip };
}

/** Header suggestions in the shape of the old /api/suggest. */
export async function suggest(q: string) {
  const r = await search(q);
  return {
    cats: r.cats.slice(0, 5).map(([n, s, c]) => ({ u: `/${s}/`, n, c })),
    offers: r.rows.slice(0, 6).map((p) => ({ u: `/${p[1]}/`, n: p[2], p: cena(p[4]) })),
  };
}

/** /hladat/?s=… (stranky/Hledani.astro). */
export async function hledani(root: HTMLElement): Promise<void> {
  const sp = new URLSearchParams(location.search);
  const q = (sp.get('s') ?? '').trim().slice(0, 100);
  const out = root.querySelector<HTMLElement>('[data-vysledky]')!;
  const h1 = root.querySelector('[data-h1]'), lead = root.querySelector('[data-lead]');
  for (const i of document.querySelectorAll<HTMLInputElement>('input[name="s"]')) if (!i.value) i.value = q;
  if (h1) h1.textContent = q ? `Hľadáte „${q}“` : 'Hľadanie';
  if (root.dataset.title && q) document.title = root.dataset.title.replace('%q%', q);
  if (!q) { if (lead) lead.textContent = 'Nič sme nenašli — skúste iné slovo alebo prejdite kategórie.'; out.innerHTML = ''; return; }
  let r: Found;
  try { r = await search(q); } catch { out.innerHTML = '<p class="prazdne">Vyhľadávanie sa nepodarilo načítať. Skúste to prosím znova.</p>'; return; }
  const total = r.rows.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, strana(sp));
  if (lead) lead.textContent = total ? `Našli sme ${cislo(total)} ${total === 1 ? 'ponuku' : ponuk(total)}.` : 'Nič sme nenašli — skúste iné slovo alebo prejdite kategórie.';
  const url = (k: number) => `/hladat/?s=${encodeURIComponent(q)}${k > 1 ? '&strana=' + k : ''}`;
  out.innerHTML = total > 0 ? mrizka(r.rows.slice((page - 1) * PER_PAGE, page * PER_PAGE), r.ps, r.ip) + strankovani(url, page, pages) : '';
}
