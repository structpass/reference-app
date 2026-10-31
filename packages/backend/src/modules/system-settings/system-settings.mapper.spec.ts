import { makeSystemSettingEntity } from '../../__tests__/factories';
import { toSystemSettingWithUpdaterResponse } from './system-settings.mapper';

describe('system-settings.mapper', () => {
  describe('toSystemSettingWithUpdaterResponse (with updater shape)', () => {
    it('SystemSetting DTO の主要 shape を返す（updater 関係 + Date インスタンス保持）', () => {
      const dto = toSystemSettingWithUpdaterResponse(makeSystemSettingEntity());
      expect(dto).toMatchObject({
        id: 'setting-1',
        key: 'company.name',
        value: 'StructPass株式会社',
        valueType: 'STRING',
        label: '会社名',
        description: 'システム上に表示される会社名',
        category: 'branding',
        sortOrder: 0,
        updatedById: 'user-1',
        updatedBy: { id: 'user-1', name: 'admin' },
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('updatedBy が null の場合は null を保持する', () => {
      const dto = toSystemSettingWithUpdaterResponse(
        makeSystemSettingEntity({ updatedBy: null, updatedById: null }),
      );
      expect(dto.updatedBy).toBeNull();
      expect(dto.updatedById).toBeNull();
    });

    it('updatedBy の余計なフィールドを含めない (規約 §1 DTO 境界)', () => {
      const entity = makeSystemSettingEntity({
        updatedBy: {
          id: 'user-1',
          name: 'admin',
          email: 'admin@example.com',
          passwordHash: 'should-not-leak',
        } as never,
      });
      const dto = toSystemSettingWithUpdaterResponse(entity);
      expect(dto.updatedBy).toEqual({ id: 'user-1', name: 'admin' });
      expect(dto.updatedBy).not.toHaveProperty('email');
      expect(dto.updatedBy).not.toHaveProperty('passwordHash');
    });

    it('description が null でも保持する', () => {
      const dto = toSystemSettingWithUpdaterResponse(
        makeSystemSettingEntity({ description: null }),
      );
      expect(dto.description).toBeNull();
    });

    it('valueType / category / sortOrder などスカラーをそのまま保持する', () => {
      const dto = toSystemSettingWithUpdaterResponse(
        makeSystemSettingEntity({ valueType: 'number', category: 'limit', sortOrder: 5 }),
      );
      expect(dto.valueType).toBe('number');
      expect(dto.category).toBe('limit');
      expect(dto.sortOrder).toBe(5);
    });
  });
});
