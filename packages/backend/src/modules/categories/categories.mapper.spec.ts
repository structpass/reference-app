import { makeCategoryEntity } from '../../__tests__/factories';
import { toCategoryResponse } from './categories.mapper';

describe('categories.mapper', () => {
  describe('toCategoryResponse', () => {
    it('Category の主要フィールドを返す (Tier A passthrough)', () => {
      const dto = toCategoryResponse(makeCategoryEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'CAT-001',
        name: '電子部品',
        status: 'ACTIVE',
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('status が INACTIVE の場合も保持する', () => {
      const dto = toCategoryResponse(makeCategoryEntity({ status: 'INACTIVE' }));
      expect(dto.status).toBe('INACTIVE');
    });
  });
});
