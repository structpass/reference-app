import { type Shipment, type ShipmentLine, ShipmentStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeShipment = makeBase<Shipment>({
  id: 1,
  shipmentNo: 'SHP-2026-0001',
  shipmentDate: BASE_DATE_ISO,
  warehouseId: 1,
  destination: '東京都港区...',
  carrierId: 1,
  status: ShipmentStatus.DRAFT,
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});

export const makeShipmentLine = makeBase<ShipmentLine>({
  id: 1,
  shipmentId: 1,
  lineNo: 1,
  productId: 'prod-1',
  plannedQty: 10,
  actualQty: 10,
});
