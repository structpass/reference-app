import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

/**
 * orders / shipments / receivings / stocktakings は同型の document-style list を返すため
 * factory + 個別 fixture で使い回す。
 */
export interface OrderFixture {
  id: number;
  orderNo: string;
  orderDate: string;
  totalAmount: number | null;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED';
  supplier: { id: number; name: string };
}

export interface ShipmentFixture {
  id: number;
  shipmentNo: string;
  shipmentDate: string;
  destination: string;
}

export interface ReceivingFixture {
  id: number;
  receivingNo: string;
  receivingDate: string;
  supplier: { id: number; name: string };
}

export interface StocktakingFixture {
  id: number;
  stocktakingDate: string;
  status: 'DRAFT' | 'CONFIRMED';
  stocktaker?: string | null;
  warehouse?: { id: number; code: string; name: string };
}

function listResponse<T>(items: T[]) {
  return HttpResponse.json({
    data: items,
    meta: { total: items.length, page: 1, limit: 10, totalPages: 1 },
  });
}

export function ordersListHandler(items: OrderFixture[] = defaultOrders) {
  return http.get(apiPath('/orders'), () => listResponse(items));
}

export function shipmentsListHandler(items: ShipmentFixture[] = defaultShipments) {
  return http.get(apiPath('/shipments'), () => listResponse(items));
}

export function receivingsListHandler(items: ReceivingFixture[] = defaultReceivings) {
  return http.get(apiPath('/receivings'), () => listResponse(items));
}

export function stocktakingsListHandler(items: StocktakingFixture[] = defaultStocktakings) {
  return http.get(apiPath('/stocktakings'), () => listResponse(items));
}

export const defaultOrders: OrderFixture[] = [
  {
    id: 1,
    orderNo: 'PO-0001',
    orderDate: '2026-04-01',
    totalAmount: 12345,
    status: 'DRAFT',
    supplier: { id: 1, name: '仕入先 A' },
  },
  {
    id: 2,
    orderNo: 'PO-0002',
    orderDate: '2026-04-02',
    totalAmount: 67890,
    status: 'ORDERED',
    supplier: { id: 2, name: '仕入先 B' },
  },
];

export const defaultShipments: ShipmentFixture[] = [
  { id: 1, shipmentNo: 'SH-0001', shipmentDate: '2026-04-10', destination: '東京物流センター' },
  { id: 2, shipmentNo: 'SH-0002', shipmentDate: '2026-04-11', destination: '大阪倉庫' },
];

export const defaultReceivings: ReceivingFixture[] = [
  {
    id: 1,
    receivingNo: 'RC-0001',
    receivingDate: '2026-04-05',
    supplier: { id: 1, name: '仕入先 A' },
  },
  {
    id: 2,
    receivingNo: 'RC-0002',
    receivingDate: '2026-04-06',
    supplier: { id: 2, name: '仕入先 B' },
  },
];

export const defaultStocktakings: StocktakingFixture[] = [
  {
    id: 1,
    stocktakingDate: '2026-04-15',
    status: 'DRAFT',
    stocktaker: '山田 太郎',
    warehouse: { id: 1, code: 'W-001', name: '東京倉庫' },
  },
  {
    id: 2,
    stocktakingDate: '2026-04-16',
    status: 'CONFIRMED',
    stocktaker: '佐藤 花子',
    warehouse: { id: 2, code: 'W-002', name: '大阪倉庫' },
  },
];
