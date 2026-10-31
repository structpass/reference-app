import { Prisma } from '@prisma/client';
import type { OrderWithRelations, OrderItemWithProduct } from '../../modules/orders/orders.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeOrderItemEntity = makeBase<OrderItemWithProduct>({
  id: 1,
  orderId: 1,
  lineNo: 1,
  productId: 'prod-1',
  orderQty: 10,
  unitPrice: new Prisma.Decimal('500.00'),
  amount: new Prisma.Decimal('5000.00'),
  product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
} as OrderItemWithProduct);

export const makeOrderEntity = makeBase<OrderWithRelations>({
  id: 1,
  orderNo: 'PO-20260316-001',
  orderDate: new Date('2026-03-16'),
  supplierId: 1,
  desiredDeliveryDate: null,
  status: 'DRAFT',
  totalQty: 10,
  totalAmount: new Prisma.Decimal('5000.00'),
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  supplier: { id: 1, name: 'サプライヤーA', code: 'SUP-001' },
  creator: { id: 'user-1', name: 'admin' },
  items: [makeOrderItemEntity()],
} as OrderWithRelations);
