import { type Receiving, type ReceivingLine, ReceivingStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeReceiving = makeBase<Receiving>({
  id: 1,
  receivingNo: 'RCV-2026-0001',
  receivingDate: BASE_DATE_ISO,
  warehouseId: 1,
  supplierId: 1,
  supplier: { id: 1, name: 'テスト仕入先', code: 'SUP-001' },
  status: ReceivingStatus.DRAFT,
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});

export const makeReceivingLine = makeBase<ReceivingLine>({
  id: 1,
  receivingId: 1,
  lineNo: 1,
  productId: 'prod-1',
  plannedQty: 10,
  actualQty: 10,
});
