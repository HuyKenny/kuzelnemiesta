// Partners: colour, name and what the detail page promises for each of them. The perks are facts from the partner's own
// pages (taken over from the Czech sister site on 2. 11. 2026, Adrop.sk = same terms as Adrop.cz) — the offer box lists
// them under the price, the CTA names the outcome, not the shop. Only Zľavomat.sk and Adrop.sk feed this site.
export interface Partner {
  name: string; color: string;
  /** what the buyer gets (box under the CTA) */
  perks: string[];
  /** verb of the CTA: "Objednať voucher" / "Rezervovať" */
  verb: string;
  /** one line below the CTA */
  trust: string;
  /** the price is per unit ("za noc"), not for the whole offer */
  unit?: string;
  /** false: booked at the partner, no voucher e-mailed */
  voucher?: false;
}
const P: Record<string, Partner> = {
  'zlavomat-sk': {
    name: 'Zľavomat.sk', color: '#E2001A', verb: 'Objednať voucher',
    perks: ['Voucher príde hneď e-mailom', 'Hodí sa ako darček – termín si vyberie obdarovaný', 'Platnosť voucheru vidíte pri každej ponuke'],
    trust: 'Platba aj voucher cez Zľavomat.sk · cena je rovnaká ako u partnera',
  },
  'adrop-sk': {
    name: 'Adrop.sk', color: '#FF6A00', verb: 'Objednať poukaz',
    perks: ['Platnosť poukazu 12 mesiacov od kúpy', 'E-poukaz hneď do e-mailu alebo v darčekovom balení', 'Termín si rezervujete online po zadaní poukazu', 'Poukaz môžete darovať – obdarovaný si vyberie deň'],
    trust: 'Platba cez Adrop.sk · cena je rovnaká ako u partnera',
  },
};
const FALLBACK: Partner = { name: 'partnera', color: '#0c7f67', verb: 'Objednať', perks: ['Voucher príde e-mailom'], trust: 'Platba u partnera · cena je rovnaká' };
export const partner = (slug: string | undefined): Partner => P[slug ?? ''] ?? FALLBACK;
export const partnerColor = (slug: string | undefined) => partner(slug).color;
export const partnerName = (slug: string | undefined) => partner(slug).name;
