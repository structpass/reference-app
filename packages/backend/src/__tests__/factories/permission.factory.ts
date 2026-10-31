import type { RolePermission, UserRole } from '@prisma/client';
import { makeBase } from './_base';

export const makeRolePermissionEntity = makeBase<RolePermission>({
  id: 1,
  role: 'WH_USER' as UserRole,
  featureId: 'products',
  canView: true,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
});
