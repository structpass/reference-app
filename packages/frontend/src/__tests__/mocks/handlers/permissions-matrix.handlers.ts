import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

/**
 * 機能別権限設定画面 (PermissionMatrix) 用 handler.
 *
 * `permissions.handlers.ts` は usePermissions hook が呼ぶ `/permissions/my-permissions` 専用。
 * こちらは matrix UI が呼ぶ `/permissions/roles` (GET / PUT) を扱う。
 */
export interface PermissionRoleRow {
  role: string;
  featureId: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function permissionsRolesGetHandler(rows: PermissionRoleRow[] = defaultPermissionRows) {
  return http.get(apiPath('/permissions/roles'), () => HttpResponse.json({ data: rows }));
}

export const permissionsRolesPutHandler = http.put(apiPath('/permissions/roles'), () =>
  HttpResponse.json({ data: { success: true } }),
);

export const defaultPermissionRows: PermissionRoleRow[] = [
  {
    role: 'WH_USER',
    featureId: 'products',
    canView: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  },
  {
    role: 'WH_ADMIN',
    featureId: 'products',
    canView: true,
    canCreate: true,
    canUpdate: true,
    canDelete: false,
  },
];
