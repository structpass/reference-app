/**
 * 入出荷履歴の統合レコード（入荷/出荷を単一 shape に正規化したレスポンス DTO）。
 * shared の ShippingRecord（JSON 化後 = date/createdAt が string）の backend 側ミラー。
 */
export interface ShippingRecord {
  type: 'RECEIVING' | 'SHIPMENT';
  id: number;
  documentNo: string;
  date: Date;
  warehouseName: string;
  counterparty: string;
  status: string;
  createdAt: Date;
}
