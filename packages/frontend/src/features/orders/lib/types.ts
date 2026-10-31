import type { Order, OrderItem } from '@struct-pass/shared';

/** 発注＋明細行（items 同梱で取得する shape）。[id] 編集/閲覧ページで共用。 */
export type OrderWithItems = Order & { items?: OrderItem[] };
