import { makeRolePermissionEntity } from '../../__tests__/factories';
import { toRolePermissionResponse } from './permissions.mapper';

describe('permissions.mapper', () => {
  describe('toRolePermissionResponse', () => {
    it('RolePermission の CRUD フラグを返す', () => {
      const dto = toRolePermissionResponse(
        makeRolePermissionEntity({
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false,
        }),
      );
      expect(dto).toMatchObject({
        id: 1,
        role: 'WH_USER',
        featureId: 'products',
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
      });
    });

    it('全フラグ false の状態を正しく返す', () => {
      const dto = toRolePermissionResponse(
        makeRolePermissionEntity({
          canView: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        }),
      );
      expect(dto.canView).toBe(false);
      expect(dto.canCreate).toBe(false);
      expect(dto.canUpdate).toBe(false);
      expect(dto.canDelete).toBe(false);
    });
  });
});
