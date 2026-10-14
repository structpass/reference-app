import {
  makeStockWithRelationsEntity,
  makeStockWithExportRelationsEntity,
} from '../../__tests__/factories';
import {
  toStockWithRelationsResponse,
  toStockExportResponse,
  toStockWithRelationsListResponse,
  toStockExportListResponse,
} from './stocks.mapper';

describe('stocks.mapper', () => {
  describe('toStockWithRelationsResponse', () => {
    it('Stock + warehouse + product + category の整形 shape を返す', () => {
      const dto = toStockWithRelationsResponse(makeStockWithRelationsEntity());
      expect(dto).toMatchObject({
        id: 1,
        warehouseId: 10,
        productId: 'P-001',
        quantity: 100,
        warehouse: { id: 10, name: '東京倉庫', code: 'W-001' },
        product: {
          id: 'P-001',
          name: 'コンデンサ',
          code: 'P-001',
          unit: 'pcs',
          category: { id: 5, name: '電子部品' },
        },
      });
    });

    it('product.category が null の場合は undefined に変換する', () => {
      const entity = makeStockWithRelationsEntity();
      const dto = toStockWithRelationsResponse({
        ...entity,
        product: { ...entity.product!, category: null } as never,
      });
      expect(dto.product?.category).toBeUndefined();
    });

    it('warehouse / product が null の場合は undefined に変換する', () => {
      const dto = toStockWithRelationsResponse({
        ...makeStockWithRelationsEntity(),
        warehouse: null,
        product: null,
      } as never);
      expect(dto.warehouse).toBeUndefined();
      expect(dto.product).toBeUndefined();
    });

    it('product.unit が null でも保持する', () => {
      const entity = makeStockWithRelationsEntity();
      const dto = toStockWithRelationsResponse({
        ...entity,
        product: { ...entity.product!, unit: null } as never,
      });
      expect(dto.product?.unit).toBeNull();
    });
  });

  describe('toStockExportResponse', () => {
    it('CSV export 用の縮約 shape を返す (id 系除外、name/code のみ)', () => {
      const dto = toStockExportResponse(makeStockWithExportRelationsEntity());
      expect(dto).toMatchObject({
        id: 1,
        warehouseId: 10,
        productId: 'P-001',
        quantity: 100,
        warehouse: { name: '東京倉庫', code: 'W-001' },
        product: {
          name: 'コンデンサ',
          code: 'P-001',
          unit: 'pcs',
          category: { name: '電子部品' },
        },
      });
      expect(dto.warehouse).not.toHaveProperty('id');
      expect(dto.product).not.toHaveProperty('id');
    });

    it('product.category が null の場合は undefined に変換する', () => {
      const entity = makeStockWithExportRelationsEntity();
      const dto = toStockExportResponse({
        ...entity,
        product: { ...entity.product, category: null } as never,
      });
      expect(dto.product.category).toBeUndefined();
    });
  });

  describe('list helpers', () => {
    it('toStockWithRelationsListResponse は配列 map である', () => {
      const result = toStockWithRelationsListResponse([
        makeStockWithRelationsEntity(),
        makeStockWithRelationsEntity({ id: 2, productId: 'P-002' }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1].id).toBe(2);
    });

    it('toStockExportListResponse は配列 map である', () => {
      const result = toStockExportListResponse([
        makeStockWithExportRelationsEntity(),
        makeStockWithExportRelationsEntity({ id: 2 }),
      ]);
      expect(result).toHaveLength(2);
      expect(result[1].id).toBe(2);
    });
  });
});
