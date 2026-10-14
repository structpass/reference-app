import type { Shipment, ShipmentLine } from '@struct-pass/shared';

/** 出荷＋明細行（lines 同梱で取得する shape）。[id] 編集/閲覧ページで共用。 */
export type ShipmentWithLines = Shipment & { lines?: ShipmentLine[] };
