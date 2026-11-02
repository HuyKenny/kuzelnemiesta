// Listing sort and filters in the URL (WooCommerce parameter names, so old links keep working):
//   ?orderby=popularity|price|price-desc|date|disc   ?min_price= &max_price=   ?partner=zlavomat-sk|adrop-sk
// Any filter or a non-default sort makes the page noindex, follow without a canonical (the indexable listing is the plain URL).
import type { ListQuery, Sort } from './db';

export interface FilterState { sort: Sort; min?: number | undefined; max?: number | undefined; partner: string }
export const SORTS: Array<[Sort, string]> = [['pop', 'Najobľúbenejšie'], ['date', 'Najnovšie'], ['price', 'Najlacnejšie'], ['price-desc', 'Najdrahšie'], ['disc', 'Najväčšia úspora']];
const ALIAS: Record<string, Sort> = { popularity: 'pop', rating: 'pop', 'menu_order': 'pop', pop: 'pop', date: 'date', price: 'price', 'price-desc': 'price-desc', disc: 'disc' };

export function parseFilters(sp: URLSearchParams): FilterState {
  const sort = ALIAS[sp.get('orderby') ?? ''] ?? 'pop';
  const num = (k: string) => { const v = sp.get(k); if (v === null || v.trim() === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined; };
  const partner = (sp.get('partner') ?? '').toLowerCase();
  return { sort, min: num('min_price'), max: num('max_price'), partner: /^[a-z0-9-]{3,40}$/.test(partner) ? partner : '' };
}
export const isFiltered = (f: FilterState) => f.sort !== 'pop' || f.min !== undefined || f.max !== undefined || !!f.partner;

export function toQuery(f: FilterState): string {
  const sp = new URLSearchParams();
  if (f.sort !== 'pop') sp.set('orderby', f.sort);
  if (f.min !== undefined) sp.set('min_price', String(f.min));
  if (f.max !== undefined) sp.set('max_price', String(f.max));
  if (f.partner) sp.set('partner', f.partner);
  const s = sp.toString();
  return s ? '?' + s : '';
}
export function toListQuery(f: FilterState, page: number, storeId?: number): ListQuery {
  return { page, sort: f.sort, min: f.min, max: f.max, store: storeId };
}
