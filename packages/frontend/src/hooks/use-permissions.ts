'use client';

import { useCallback } from 'react';
import { usePermissionsContext, type PermissionEntry } from '@/contexts/permissions-provider';

/**
 * 権限参照 hook（Context 経由）。
 *
 * 内部実装は <PermissionsProvider> の Context 読み取りに差し替え済。
 * 公開 API（permissions / loaded / error / canView / canCreate / canUpdate / canDelete）は据え置き。
 * Provider 配下で使うこと（Provider 外で呼ぶと throw）。
 */
export function usePermissions() {
  const { permissions, loaded, error } = usePermissionsContext();

  const findPerm = useCallback(
    (featureId: string): PermissionEntry | undefined => {
      return permissions.find((p) => p.featureId === featureId);
    },
    [permissions],
  );

  const canView = useCallback(
    (featureId: string): boolean => {
      if (!loaded || error) return false;
      const entry = findPerm(featureId);
      return entry ? entry.canView : false;
    },
    [loaded, error, findPerm],
  );

  const canCreate = useCallback(
    (featureId: string): boolean => {
      if (!loaded || error) return false;
      const entry = findPerm(featureId);
      return entry ? entry.canCreate : false;
    },
    [loaded, error, findPerm],
  );

  const canUpdate = useCallback(
    (featureId: string): boolean => {
      if (!loaded || error) return false;
      const entry = findPerm(featureId);
      return entry ? entry.canUpdate : false;
    },
    [loaded, error, findPerm],
  );

  const canDelete = useCallback(
    (featureId: string): boolean => {
      if (!loaded || error) return false;
      const entry = findPerm(featureId);
      return entry ? entry.canDelete : false;
    },
    [loaded, error, findPerm],
  );

  return { permissions, loaded, error, canView, canCreate, canUpdate, canDelete };
}
