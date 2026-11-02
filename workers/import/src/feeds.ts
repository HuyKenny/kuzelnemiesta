// The two partner feeds of kuzelnemiesta.sk (2. 11. 2026) — they replace WP All Import imports 7/8 (Zlavomat) and 10
// (Adrop). URLs live in secrets (FEED_URL_ZLAVOMAT carries an auth token): scripts/set-feed-secrets.py <env>.
// ZlavaDna (import 9, Dognet) ended its affiliate programme — its offers end with the WordPress catalogue.
export type Source = 'zlavomat' | 'adrop' | 'futbaltour';

export interface FeedDef {
  key: Source;
  /** XML element of one offer */
  item: 'DEAL' | 'SHOPITEM' | 'item';
  /** stores.slug (WordPress taxonomy "store") */
  store: string;
  secret: string;
  /** hours between runs */
  everyH: number;
}

export const FEEDS: FeedDef[] = [
  { key: 'zlavomat', item: 'DEAL', store: 'zlavomat-sk', secret: 'FEED_URL_ZLAVOMAT', everyH: 12 },
  { key: 'adrop', item: 'SHOPITEM', store: 'adrop-sk', secret: 'FEED_URL_ADROP', everyH: 24 },
  // FutbalTour.sk (zájazdy so vstupenkou na futbal, hokej, F1 …; Google Merchant RSS na Mergade, eHub kampaň 06a468a6)
  { key: 'futbaltour', item: 'item', store: 'futbaltour', secret: 'FEED_URL_FUTBALTOUR', everyH: 12 },
];

/** Zlavomat affiliate UTM exactly as the WordPress import sent it (Slevomat group, campaign of kuzelnemiesta.sk).
 *  utm_content is the placement of the click — /go/ rewrites it per click (detail-pobyty, karta-darceky …). */
export const ZLAVOMAT_CAMPAIGN = 'dis_akv_gen_svk_all_buy_q6q55khb_kuzelnemiestaSK';
export function affiliateUrl(src: Source, id: string, url: string): string {
  if (src === 'zlavomat') {
    return `${url}?utm_source=affiliate&utm_medium=cpc&utm_campaign=${ZLAVOMAT_CAMPAIGN}&utm_content=${id}&utm_term=q6q55khb`;
  }
  // FutbalTour.sk eHub deeplink (Kenny 3. 11. 2026: the old bid 91959d88 returned an error)
  if (src === 'futbaltour') return `https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=06a468a6&desturl=${url}`;
  return ehubUrl(id, url);
}
/** eHub (Adrop.sk campaign 640cdf23): desturl is appended raw (that is how every live link looks and is tracked). */
export function ehubUrl(id: string, url: string): string {
  return `https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=640cdf23&data1=${id}&desturl=${url}`;
}

/** WP All Import renamed the root "Zážitky a zábava" to "Zážitky" (the old tree, whose names cat_alias keeps). */
export const ZLAVOMAT_MAP: Record<string, string> = { 'Zážitky a zábava': 'Zážitky' };
/** Travel deals (root "Cestovanie"): same rename. */
export const ZLAVOMAT_TRAVEL_MAP: Record<string, string> = { 'Zážitky a zábava': 'Zážitky' };

/** Zlavomat deals not imported: goods, practical services (car wash, tyres, cleaning…), driving school. */
export const ZLAVOMAT_SKIP = ['Tovar', 'Praktické', 'Fotodarčeky', 'Potraviny', 'Autoškola'];
/** Adrop items not imported: physical gifts, clothing (T-shirts), generic vouchers. */
export const ADROP_SKIP = ['Hmotné', 'Oblečení', 'Oblečenie', 'tričk', 'poukaz', 'poukážk'];

/** Zlavomat categories of goods — a deal whose categories are only these is not imported. */
export const ZLAVOMAT_GOODS = ['Jedlo so sebou', 'Rozvoz jedla', 'Delikatesy'];

/** The SK feed still speaks Czech in a few travel fields (BOARD, TRANSPORT) → Slovak for display. */
export const SK_TERMS: Record<string, string> = {
  'snídaně v ceně': 'raňajky v cene', 'bez stravy': 'bez stravy', 'polopenze': 'polpenzia', 'plná penze': 'plná penzia',
  'all inclusive': 'all inclusive', 'vlastní doprava': 'vlastná doprava', 'autobusem': 'autobusom', 'letecky': 'letecky',
};
