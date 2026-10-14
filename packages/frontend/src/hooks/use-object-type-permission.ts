'use client';

import { useCallback, useMemo } from 'react';
import { isValidObjectTypeKey, objectTypePermissionId } from '@struct-pass/shared';
import { usePermissions } from './use-permissions';

export type ObjectTypePermissionAction = 'view' | 'create' | 'update' | 'delete';

/** ObjectTypeの種類に応じた静的/動的permission IDを解決する。 */
export function resolveObjectTypePermissionId(key: string, isPreset: boolean): string | null {
  if (isPreset) return 'object-types';
  return isValidObjectTypeKey(key) ? objectTypePermissionId(key) : null;
}

/**
 * ObjectType画面用の権限参照。
 * presetは既存の静的object-types権限、非presetはshared helperから導出した動的IDを使う。
 * 非presetのwriteはbackend契約と揃えてviewも同時に要求する。
 */
export function useObjectTypePermission(key: string, isPreset: boolean) {
  const { canView: canViewFeature, canCreate, canUpdate, canDelete } = usePermissions();
  const permissionId = useMemo(() => resolveObjectTypePermissionId(key, isPreset), [isPreset, key]);

  const canView = useCallback(
    () => (permissionId ? canViewFeature(permissionId) : false),
    [canViewFeature, permissionId],
  );
  const canCreateForObjectType = useCallback(
    () =>
      permissionId ? canCreate(permissionId) && (isPreset || canViewFeature(permissionId)) : false,
    [canCreate, canViewFeature, isPreset, permissionId],
  );
  const canUpdateForObjectType = useCallback(
    () =>
      permissionId ? canUpdate(permissionId) && (isPreset || canViewFeature(permissionId)) : false,
    [canUpdate, canViewFeature, isPreset, permissionId],
  );
  const canDeleteForObjectType = useCallback(
    () =>
      permissionId ? canDelete(permissionId) && (isPreset || canViewFeature(permissionId)) : false,
    [canDelete, canViewFeature, isPreset, permissionId],
  );

  return {
    permissionId,
    canView,
    canCreate: canCreateForObjectType,
    canUpdate: canUpdateForObjectType,
    canDelete: canDeleteForObjectType,
  };
}
