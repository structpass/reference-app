import { type Order, type OrderItem, OrderStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeOrder = makeBase<Order>({
  id: 1,
  orderNo: 'ORD-2026-0001',
  orderDate: BASE_DATE_ISO,
  supplierId: 1,
  supplier: { id: 1, name: 'テスト仕入先', code: 'SUP-001' },
  desiredDeliveryDate: BASE_DATE_ISO,
  status: OrderStatus.DRAFT,
  totalQty: 10,
  totalAmount: 10000,
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});

export const makeOrderItem = makeBase<OrderItem>({
  id: 1,
  orderId: 1,
  lineNo: 1,
  productId: 'prod-1',
  orderQty: 10,
  unitPrice: 1000,
  amount: 10000,
});
