import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

export interface StockFixture {
  id: number;
  warehouseId: number;
  productId: string;
  quantity: number;
  warehouse: { id: number; code: string; name: string };
  product: {
    id: string;
    code: string;
    name: string;
    unit?: string | null;
    category?: { id: number; name: string } | null;
  };
}

export function stocksListHandler(items: StockFixture[] = defaultStocks) {
  return http.get(apiPath('/stocks'), () =>
    HttpResponse.json({
      data: items,
      meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );
}

export const defaultStocks: StockFixture[] = [
  {
    id: 1,
    warehouseId: 1,
    productId: 'prod-1',
    quantity: 120,
    warehouse: { id: 1, code: 'W-001', name: '東京倉庫' },
    product: {
      id: 'prod-1',
      code: 'P-001',
      name: 'コンデンサ A',
      unit: '個',
      category: { id: 1, name: '電子部品' },
    },
  },
  {
    id: 2,
    warehouseId: 2,
    productId: 'prod-2',
    quantity: 45,
    warehouse: { id: 2, code: 'W-002', name: '大阪倉庫' },
    product: {
      id: 'prod-2',
      code: 'P-002',
      name: '抵抗 B',
      unit: '個',
      category: { id: 1, name: '電子部品' },
    },
  },
];

export interface ForecastFixture extends StockFixture {
  incomingQty: number;
  outgoingQty: number;
  forecastQty: number;
  alert: 'shortageRisk' | 'surplus' | 'normal';
}

export function forecastListHandler(items: ForecastFixture[] = defaultForecasts) {
  return http.get(apiPath('/stocks/forecast'), () =>
    HttpResponse.json({
      data: items,
      meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );
}

export const defaultForecasts: ForecastFixture[] = [
  {
    id: 1,
    warehouseId: 1,
    productId: 'prod-1',
    quantity: 120,
    warehouse: { id: 1, code: 'W-001', name: '東京倉庫' },
    product: {
      id: 'prod-1',
      code: 'P-001',
      name: 'コンデンサ A',
      unit: '個',
      category: { id: 1, name: '電子部品' },
    },
    incomingQty: 30,
    outgoingQty: 0,
    forecastQty: 150,
    alert: 'normal',
  },
  {
    id: 2,
    warehouseId: 2,
    productId: 'prod-2',
    quantity: 45,
    warehouse: { id: 2, code: 'W-002', name: '大阪倉庫' },
    product: {
      id: 'prod-2',
      code: 'P-002',
      name: '抵抗 B',
      unit: '個',
      category: { id: 1, name: '電子部品' },
    },
    incomingQty: 0,
    outgoingQty: 60,
    forecastQty: -15,
    alert: 'shortageRisk',
  },
];
