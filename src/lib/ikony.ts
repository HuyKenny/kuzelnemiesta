// Category icons (redesign v2): every node of src/data/taxonomie.json names a symbol of the line-icon sprite
// public/a/i2.svg (<Ik n=…>); a node without its own falls back to the nearest ancestor's.
import { ancestry, type Tree } from './db';

export function catIcon(t: Tree, id: number): string {
  for (const c of ancestry(t, id).reverse()) if (c.icon) return c.icon;
  return 'darek';
}
