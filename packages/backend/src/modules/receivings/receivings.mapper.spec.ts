import { makeReceivingEntity, makeReceivingLineEntity, BASE_DATE } from '../../__tests__/factories';
import { toReceivingResponse, toReceivingListResponse } from './receivings.mapper';

describe('receivings.mapper', () => {
  describe('toReceivingResponse', () => {
    it('Receiving DTO の主要 shape を保つ（relation 展開, soft-delete null）', () => {
      const dto = toReceivingResponse(makeReceivingEntity());
      expect(dto).toMatchObject({
        id: 1,
        receivingNo: 'RCV-20260424-001',
        warehouseId: 10,
        supplierId: 20,
        status: 'DRAFT',
        createdBy: 'user-1',
        deletedAt: null,
        warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
        supplier: { id: 20, name: 'サプライヤーA', code: 'SUP-001' },
        creator: { id: 'user-1', name: 'admin' },
      });
      expect(dto.receivingDate).toBeInstanceOf(Date);
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('warehouse / supplier / creator が null の場合は undefined に変換する', () => {
      const dto = toReceivingResponse(
        makeReceivingEntity({ warehouse: null, supplier: null, creator: null }),
      );
      expect(dto.warehouse).toBeUndefined();
      expect(dto.supplier).toBeUndefined();
      expect(dto.creator).toBeUndefined();
    });

    it('lines をそのまま map し product を展開する', () => {
      const dto = toReceivingResponse(makeReceivingEntity());
      expect(dto.lines).toHaveLength(1);
      expect(dto.lines![0]).toMatchObject({
        id: 100,
        lineNo: 1,
        productId: 'prod-1',
        plannedQty: 10,
        actualQty: 8,
        product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
      });
    });

    it('line の product が null の場合は undefined / actualQty が null は保持', () => {
      const dto = toReceivingResponse(
        makeReceivingEntity({
          lines: [makeReceivingLineEntity({ product: null as never, actualQty: null })],
        }),
      );
      expect(dto.lines![0].product).toBeUndefined();
      expect(dto.lines![0].actualQty).toBeNull();
    });

    it('deletedAt が Date の場合は Date を保持する (soft-delete)', () => {
      const dto = toReceivingResponse(makeReceivingEntity({ deletedAt: BASE_DATE }));
      expect(dto.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('toReceivingListResponse', () => {
    it('配列を map し、各要素が DTO shape を保つ', () => {
      const dto = toReceivingListResponse([
        makeReceivingEntity(),
        makeReceivingEntity({ id: 2, receivingNo: 'RCV-20260424-002' }),
      ]);
      expect(dto).toHaveLength(2);
      expect(dto[1]).toMatchObject({ id: 2, receivingNo: 'RCV-20260424-002' });
    });

    it('空配列は空配列を返す', () => {
      expect(toReceivingListResponse([])).toEqual([]);
    });
  });
});
