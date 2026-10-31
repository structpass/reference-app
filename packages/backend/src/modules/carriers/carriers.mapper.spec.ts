import { makeCarrierEntity } from '../../__tests__/factories';
import { toCarrierResponse } from './carriers.mapper';

describe('carriers.mapper', () => {
  describe('toCarrierResponse', () => {
    it('Carrier の主要フィールドを返す (Tier A passthrough)', () => {
      const dto = toCarrierResponse(makeCarrierEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'C-001',
        name: 'ヤマト運輸',
        address: '東京都中央区',
        phone: '03-0000-0000',
        contactPerson: '山田太郎',
        email: 'yamato@example.com',
        status: 'ACTIVE',
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('null の任意フィールドを保持する (address / phone / contactPerson / email)', () => {
      const dto = toCarrierResponse(
        makeCarrierEntity({
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
