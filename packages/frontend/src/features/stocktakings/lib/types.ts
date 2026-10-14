import type { Stocktaking, StocktakingItem } from '@struct-pass/shared';

/** 棚卸＋明細行（items 同梱で取得する shape）。[id] 編集/閲覧ページで共用。 */
export type StocktakingWithItems = Stocktaking & { items?: StocktakingItem[] };
