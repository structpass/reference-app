import { Prisma } from '@prisma/client';
import { makeProductEntity, BASE_DATE } from '../../__tests__/factories';
import { toProductResponse, toProductListResponse } from './products.mapper';

describe('productsMapper', () => {
  describe('toProductResponse', () => {
    it('Product DTO の主要 shape を保つ（Decimal → number, relation 展開）', () => {
      const result = toProductResponse(makeProductEntity());
      expect(result).toMatchObject({
        id: 'p-1',
        code: 'PRD-001',
        name: 'テスト商品',
        categoryId: 1,
        price: 1234.56,
        purchasePrice: null,
        stockQuantity: 10,
        status: 'ACTIVE',
        category: { id: 1, code: 'CAT-001', name: '電子機器' },
        creator: { id: 'user-1', name: 'admin' },
        updater: null,
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
      });
    });

    it('purchasePrice が Decimal の場合は number に変換する', () => {
      const result = toProductResponse(
        makeProductEntity({ purchasePrice: new Prisma.Decimal('500.00') }),
      );
      expect(result.purchasePrice).toBe(500);
    });

    it('updater key が存在しない entity (create-include) では undefined', () => {
      const entity = makeProductEntity();
      delete (entity as Partial<typeof entity>).updater;
      const result = toProductResponse(entity);
      expect(result.updater).toBeUndefined();
    });
  });

  describe('toProductListResponse', () => {
    it('配列を map し、各要素が DTO shape を保つ', () => {
      const result = toProductListResponse([
        makeProductEntity(),
        makeProductEntity({ id: 'p-2', code: 'PRD-002' }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        id: 'p-2',
        code: 'PRD-002',
        price: 1234.56,
      });
    });

    it('空配列は空配列', () => {
      expect(toProductListResponse([])).toEqual([]);
    });
  });
});
