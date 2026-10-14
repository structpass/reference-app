import { makeShipmentEntity, makeShipmentLineEntity, BASE_DATE } from '../../__tests__/factories';
import { toShipmentResponse, toShipmentListResponse } from './shipments.mapper';

describe('shipments.mapper', () => {
  describe('toShipmentResponse', () => {
    it('Shipment DTO の主要 shape を保つ（relation 展開, soft-delete null）', () => {
      const dto = toShipmentResponse(makeShipmentEntity());
      expect(dto).toMatchObject({
        id: 1,
        shipmentNo: 'SHP-20260424-001',
        warehouseId: 10,
        destination: '東京都千代田区',
        carrierId: 30,
        status: 'DRAFT',
        createdBy: 'user-1',
        deletedAt: null,
        warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
        carrier: { id: 30, name: 'キャリアA', code: 'CAR-001' },
        creator: { id: 'user-1', name: 'admin' },
      });
      expect(dto.shipmentDate).toBeInstanceOf(Date);
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('warehouse / creator が null の場合は undefined に変換する', () => {
      const dto = toShipmentResponse(makeShipmentEntity({ warehouse: null, creator: null }));
      expect(dto.warehouse).toBeUndefined();
      expect(dto.creator).toBeUndefined();
    });

    it('carrier は null 許容 (DTO 仕様) で null をそのまま保持する', () => {
      const dto = toShipmentResponse(makeShipmentEntity({ carrier: null, carrierId: null }));
      expect(dto.carrier).toBeNull();
      expect(dto.carrierId).toBeNull();
    });

    it('lines をそのまま map し product を展開する', () => {
      const dto = toShipmentResponse(makeShipmentEntity());
      expect(dto.lines).toHaveLength(1);
      expect(dto.lines![0]).toMatchObject({
        id: 200,
        lineNo: 1,
        productId: 'prod-1',
        plannedQty: 5,
        actualQty: 5,
        product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
      });
    });

    it('line の product が null は undefined / actualQty が null は保持', () => {
      const dto = toShipmentResponse(
        makeShipmentEntity({
          lines: [makeShipmentLineEntity({ product: null as never, actualQty: null })],
        }),
      );
      expect(dto.lines![0].product).toBeUndefined();
      expect(dto.lines![0].actualQty).toBeNull();
    });

    it('deletedAt が Date の場合は Date を保持する (soft-delete)', () => {
      const dto = toShipmentResponse(makeShipmentEntity({ deletedAt: BASE_DATE }));
      expect(dto.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('toShipmentListResponse', () => {
    it('配列を map し、各要素が DTO shape を保つ', () => {
      const dto = toShipmentListResponse([
        makeShipmentEntity(),
        makeShipmentEntity({ id: 2, shipmentNo: 'SHP-20260424-002' }),
      ]);
      expect(dto).toHaveLength(2);
      expect(dto[1]).toMatchObject({ id: 2, shipmentNo: 'SHP-20260424-002' });
    });

    it('空配列は空配列を返す', () => {
      expect(toShipmentListResponse([])).toEqual([]);
    });
  });
});
