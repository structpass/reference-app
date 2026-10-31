import type { ShipmentWithRelations } from '../../modules/shipments/shipments.mapper';
import { makeBase, BASE_DATE } from './_base';

type ShipmentLine = ShipmentWithRelations['lines'][number];

export const makeShipmentLineEntity = makeBase<ShipmentLine>({
  id: 200,
  shipmentId: 1,
  lineNo: 1,
  productId: 'prod-1',
  plannedQty: 5,
  actualQty: 5,
  product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
} as ShipmentLine);

export const makeShipmentEntity = makeBase<ShipmentWithRelations>({
  id: 1,
  shipmentNo: 'SHP-20260424-001',
  shipmentDate: BASE_DATE,
  warehouseId: 10,
  destination: '東京都千代田区',
  carrierId: 30,
  status: 'DRAFT',
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
  carrier: { id: 30, name: 'キャリアA', code: 'CAR-001' },
  creator: { id: 'user-1', name: 'admin' },
  lines: [makeShipmentLineEntity()],
} as ShipmentWithRelations);
