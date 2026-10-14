export interface Stock {
  id: number;
  warehouseId: number;
  productId: string;
  quantity: number;
}

export interface StockWithRelations extends Stock {
  warehouse: { id: number; name: string; code: string };
  product: {
    id: string;
    name: string;
    code: string;
    category?: { id: number; name: string } | null;
    unit?: string | null;
  };
}

export type ForecastAlert = 'shortageRisk' | 'surplus' | 'normal';

export interface ForecastStock extends StockWithRelations {
  incomingQty: number;
  outgoingQty: number;
  forecastQty: number;
  alert: ForecastAlert;
}

export enum StocktakingStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
}

export interface Stocktaking {
  id: number;
  stocktakingDate: string;
  warehouseId: number;
  stocktaker?: string | null;
  status: StocktakingStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StocktakingItem {
  id: number;
  stocktakingId: number;
  productId: string;
  theoreticalQty: number;
  actualQty?: number | null;
  difference?: number | null;
  differenceReason?: string | null;
}
