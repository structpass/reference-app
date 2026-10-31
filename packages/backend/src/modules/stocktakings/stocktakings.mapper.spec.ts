import { makeStocktakingEntity, makeStocktakingItemEntity } from '../../__tests__/factories';
import { toStocktakingResponse, toStocktakingListResponse } from './stocktakings.mapper';

describe('stocktakings.mapper', () => {
  describe('toStocktakingResponse', () => {
    it('Stocktaking DTO の主要 shape を保つ（relation 展開）', () => {
      const dto = toStocktakingResponse(makeStocktakingEntity());
      expect(dto).toMatchObject({
        id: 1,
        warehouseId: 10,
        stocktaker: '山田太郎',
        status: 'DRAFT',
        createdBy: 'user-1',
        warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
        creator: { id: 'user-1', name: 'admin' },
      });
      expect(dto.stocktakingDate).toBeInstanceOf(Date);
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('stocktaker が null でも保持する', () => {
      const dto = toStocktakingResponse(makeStocktakingEntity({ stocktaker: null }));
      expect(dto.stocktaker).toBeNull();
    });

    it('warehouse / creator が null の場合は undefined に変換する', () => {
      const dto = toStocktakingResponse(makeStocktakingEntity({ warehouse: null, creator: null }));
      expect(dto.warehouse).toBeUndefined();
      expect(dto.creator).toBeUndefined();
    });

    it('items をそのまま map し product を展開する', () => {
      const dto = toStocktakingResponse(makeStocktakingEntity());
      expect(dto.items).toHaveLength(1);
      expect(dto.items![0]).toMatchObject({
        id: 300,
        stocktakingId: 1,
        productId: 'prod-1',
        theoreticalQty: 100,
        actualQty: 98,
        difference: -2,
        differenceReason: '破損',
        product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
      });
    });

    it('item の product が null は undefined / null フィールドは保持', () => {
      const dto = toStocktakingResponse(
        makeStocktakingEntity({
          items: [
            makeStocktakingItemEntity({
              product: null as never,
              actualQty: null,
              difference: null,
              differenceReason: null,
            }),
          ],
        }),
      );
      expect(dto.items![0].product).toBeUndefined();
      expect(dto.items![0].actualQty).toBeNull();
      expect(dto.items![0].difference).toBeNull();
      expect(dto.items![0].differenceReason).toBeNull();
    });
  });

  describe('toStocktakingListResponse', () => {
    it('配列を map し、各要素が DTO shape を保つ', () => {
      const dto = toStocktakingListResponse([
        makeStocktakingEntity(),
        makeStocktakingEntity({ id: 2 }),
      ]);
      expect(dto).toHaveLength(2);
      expect(dto[1]).toMatchObject({ id: 2 });
    });

    it('空配列は空配列を返す', () => {
      expect(toStocktakingListResponse([])).toEqual([]);
    });
  });
});
