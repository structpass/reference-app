import { Prisma } from '@prisma/client';
import { makeOrderEntity, makeOrderItemEntity, BASE_DATE } from '../../__tests__/factories';
import { toOrderItemResponse, toOrderResponse, toOrderListResponse } from './orders.mapper';

describe('ordersMapper', () => {
  describe('toOrderItemResponse', () => {
    it('OrderItem DTO の主要 shape を保つ（Decimal → number, product 展開）', () => {
      const result = toOrderItemResponse(makeOrderItemEntity());
      expect(result).toMatchObject({
        id: 1,
        orderId: 1,
        lineNo: 1,
        productId: 'prod-1',
        orderQty: 10,
        unitPrice: 500,
        amount: 5000,
        product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
      });
      expect(typeof result.unitPrice).toBe('number');
      expect(typeof result.amount).toBe('number');
    });

    it('product が null の場合は undefined に変換する', () => {
      const result = toOrderItemResponse(makeOrderItemEntity({ product: null as never }));
      expect(result.product).toBeUndefined();
    });
  });

  describe('toOrderResponse', () => {
    it('Order DTO の主要 shape を保つ（Decimal → number, relation 展開）', () => {
      const result = toOrderResponse(makeOrderEntity());
      expect(result).toMatchObject({
        id: 1,
        orderNo: 'PO-20260316-001',
        supplierId: 1,
        desiredDeliveryDate: null,
        status: 'DRAFT',
        totalQty: 10,
        totalAmount: 5000,
        createdBy: 'user-1',
        supplier: { id: 1, name: 'サプライヤーA', code: 'SUP-001' },
        creator: { id: 'user-1', name: 'admin' },
      });
      expect(typeof result.totalAmount).toBe('number');
      expect(result.orderDate).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('totalAmount が null の場合は null を保持する', () => {
      const result = toOrderResponse(makeOrderEntity({ totalAmount: null }));
      expect(result.totalAmount).toBeNull();
    });

    it('items 内の unitPrice / amount が number に変換される', () => {
      const result = toOrderResponse(makeOrderEntity());
      expect(result.items).toHaveLength(1);
      expect(result.items![0].unitPrice).toBe(500);
      expect(result.items![0].amount).toBe(5000);
    });

    it('supplier が null の場合は undefined に変換する', () => {
      const result = toOrderResponse(makeOrderEntity({ supplier: null }));
      expect(result.supplier).toBeUndefined();
    });

    it('deletedAt が Date の場合は Date を保持する (soft-delete)', () => {
      const result = toOrderResponse(makeOrderEntity({ deletedAt: BASE_DATE }));
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('deletedAt が null の場合は null を保持する', () => {
      const result = toOrderResponse(makeOrderEntity({ deletedAt: null }));
      expect(result.deletedAt).toBeNull();
    });

    it('items の totalAmount が Decimal の場合も number に変換する', () => {
      const result = toOrderResponse(
        makeOrderEntity({ totalAmount: new Prisma.Decimal('999.99') }),
      );
      expect(result.totalAmount).toBe(999.99);
    });
  });

  describe('toOrderListResponse', () => {
    it('配列を map し、各要素が DTO shape を保つ', () => {
      const result = toOrderListResponse([
        makeOrderEntity(),
        makeOrderEntity({ id: 2, orderNo: 'PO-20260316-002' }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ id: 2, orderNo: 'PO-20260316-002', totalAmount: 5000 });
      result.forEach((r) => {
        expect(typeof r.totalAmount).toBe('number');
      });
    });

    it('空配列は空配列を返す', () => {
      expect(toOrderListResponse([])).toEqual([]);
    });
  });
});
