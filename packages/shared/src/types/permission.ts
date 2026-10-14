import type { ActiveStatus } from './warehouse';
import type { UserRole } from './user';

export interface Group {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  role: UserRole;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature 単位の権限 action。
 *
 * frontend `<FeatureGuard action>` / `usePermissions().can{View,Create,Update,Delete}` と
 * backend `@RequirePermission(featureId, action)` / ObjectType単位の権限ガードで共有するSSOT。
 */
export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
