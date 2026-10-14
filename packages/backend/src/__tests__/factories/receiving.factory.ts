import type { ReceivingWithRelations } from '../../modules/receivings/receivings.mapper';
import { makeBase, BASE_DATE } from './_base';

type ReceivingLine = ReceivingWithRelations['lines'][number];

export const makeReceivingLineEntity = makeBase<ReceivingLine>({
  id: 100,
  receivingId: 1,
  lineNo: 1,
  productId: 'prod-1',
  plannedQty: 10,
  actualQty: 8,
  product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
} as ReceivingLine);

export const makeReceivingEntity = makeBase<ReceivingWithRelations>({
  id: 1,
  receivingNo: 'RCV-20260424-001',
  receivingDate: BASE_DATE,
  warehouseId: 10,
  supplierId: 20,
  status: 'DRAFT',
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
  supplier: { id: 20, name: 'サプライヤーA', code: 'SUP-001' },
  creator: { id: 'user-1', name: 'admin' },
  lines: [makeReceivingLineEntity()],
} as ReceivingWithRelations);
