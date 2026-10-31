export interface StockResponseDto {
  id: number;
  warehouseId: number;
  productId: string;
  quantity: number;
}

export interface StockWithRelationsResponseDto extends StockResponseDto {
  warehouse?: { id: number; name: string; code: string };
  product?: {
    id: string;
    name: string;
    code: string;
    unit: string | null;
    category?: { id: number; name: string };
  };
}

// ForecastAlert は shared の型を正本として再利用する（二重定義は DTO 側の変更漏れで
// API の形が静かに割れるため・ref-0060）。呼び出し側は DTO 経由でそのまま import できる。
import type { ForecastAlert } from '@struct-pass/shared';
export type { ForecastAlert } from '@struct-pass/shared';

/**
 * 予測在庫レスポンス DTO。forecast 取得は必ず warehouse/product を include するため
 * 一覧系（StockWithRelationsResponseDto）と異なり関連は必須。category は entity の
 * null をそのまま返す（既存レスポンス shape 維持）。
 */
export interface StockForecastResponseDto extends StockResponseDto {
  warehouse: { id: number; name: string; code: string };
  product: {
    id: string;
    name: string;
    code: string;
    unit: string | null;
    category: { id: number; name: string } | null;
  };
  incomingQty: number;
  outgoingQty: number;
  forecastQty: number;
  alert: ForecastAlert;
}

export interface StockExportResponseDto extends StockResponseDto {
  warehouse: { name: string; code: string };
  product: {
    name: string;
    code: string;
    unit: string | null;
    category?: { name: string };
  };
}
