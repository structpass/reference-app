import { makeSupplierEntity } from '../../__tests__/factories';
import { toSupplierResponse } from './suppliers.mapper';

describe('suppliers.mapper', () => {
  describe('toSupplierResponse', () => {
    it('Supplier の主要フィールドを返す (Tier A passthrough)', () => {
      const dto = toSupplierResponse(makeSupplierEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'S-001',
        name: '仕入先A',
        address: '大阪市中央区',
        phone: '06-0000-0000',
        contactPerson: '佐藤次郎',
        email: 'supplier-a@example.com',
        status: 'ACTIVE',
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('null の任意フィールドを保持する (address / phone / contactPerson / email)', () => {
      const dto = toSupplierResponse(
        makeSupplierEntity({
          address: null,
          phone: null,
          contactPerson: null,
          email: null,
        }),
      );
      expect(dto.address).toBeNull();
      expect(dto.phone).toBeNull();
      expect(dto.contactPerson).toBeNull();
      expect(dto.email).toBeNull();
    });
  });
});
