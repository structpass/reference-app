import type { Receiving, ReceivingLine } from '@struct-pass/shared';

/** 入荷＋明細行（lines 同梱で取得する shape）。[id] 編集/閲覧ページで共用。 */
export type ReceivingWithLines = Receiving & { lines?: ReceivingLine[] };
