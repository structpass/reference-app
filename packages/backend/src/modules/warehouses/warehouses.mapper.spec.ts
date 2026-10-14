import { makeWarehouseEntity } from '../../__tests__/factories';
import { toWarehouseResponse } from './warehouses.mapper';

describe('warehouses.mapper', () => {
  describe('toWarehouseResponse', () => {
    it('Warehouse の主要フィールドを返す (Tier A passthrough)', () => {
      const dto = toWarehouseResponse(makeWarehouseEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'W-001',
        name: '東京倉庫',
        address: '東京都江東区',
        phone: '03-1111-1111',
        manager: '管理者A',
        capacity: 1000,
        status: 'ACTIVE',
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('null の任意フィールドを保持する (address / phone / manager / capacity)', () => {
      const dto = toWarehouseResponse(
        makeWarehouseEntity({
          address: null,
          phone: null,
          manager: null,
          capacity: null,
        }),
      );
      expect(dto.address).toBeNull();
      expect(dto.phone).toBeNull();
      expect(dto.manager).toBeNull();
      expect(dto.capacity).toBeNull();
    });
  });
});
