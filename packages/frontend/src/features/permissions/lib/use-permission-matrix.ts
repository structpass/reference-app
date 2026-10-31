'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { isObjectTypePermissionId } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { fetchObjectTypesStrict } from '@/features/custom-ledger/lib/api';
import { buildLogicalFeatures, LOGICAL_FEATURES, type LogicalFeature } from './feature-list';

export type CrudPerm = {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type MatrixData = Record<string, Record<string, CrudPerm>>;

const EDITABLE_ROLES = ['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN'] as const;
export const ALL_ROLES = [...EDITABLE_ROLES, 'SYS_ADMIN'] as const;

export const ROLE_LABELS: Record<string, string> = {
  WH_USER: '倉庫(一般)',
  WH_ADMIN: '倉庫(管理)',
  OF_USER: '事務(一般)',
  OF_ADMIN: '事務(管理)',
  SYS_ADMIN: 'システム管理',
};

/**
 * SYS_ADMIN 専用機能。matrix 上は SYS_ADMIN のみ CRUD ON、他 role は全 OFF + 操作不可で固定する。
 * backend 側 `DEFAULT_ROLE_PERMISSIONS` の `sysAdminOnly` 配列および seed の
 * `SYS_ADMIN_ONLY_FEATURES` と完全一致させること。
 */
export const SYS_ADMIN_ONLY_FEATURES: ReadonlySet<string> = new Set([
  'permissions',
  'system-parameters',
  'object-types',
]);

export function createDefaultPerm(): CrudPerm {
  return { canView: false, canCreate: false, canUpdate: false, canDelete: false };
}

function createFullPerm(): CrudPerm {
  return { canView: true, canCreate: true, canUpdate: true, canDelete: true };
}

export type PermissionRoleRow = CrudPerm & { role: string; featureId: string };

function sanitizePermission(featureId: string, permission: CrudPerm): CrudPerm {
  if (isObjectTypePermissionId(featureId) && !permission.canView) {
    return { ...permission, canCreate: false, canUpdate: false, canDelete: false };
  }
  return permission;
}

/**
 * 全機能×全ロールをデフォルト値（SYS_ADMIN のみ全 ON）で初期化し、
 * DB から取得した行で上書きした matrix を返す純粋関数。
 * loadMatrix と test fixture の両方が参照する（§3 コピペ回避）。
 */
export function buildMatrix(
  rows: PermissionRoleRow[],
  features: readonly LogicalFeature[] = LOGICAL_FEATURES,
): MatrixData {
  const m: MatrixData = {};
  for (const feat of features) {
    m[feat.id] = {};
    for (const role of ALL_ROLES) {
      m[feat.id][role] = role === 'SYS_ADMIN' ? createFullPerm() : createDefaultPerm();
    }
  }
  for (const row of rows) {
    // SYS_ADMIN 専用機能はDBに不整合なRolePermissionが残っていても、
    // matrix上の「SYS_ADMINのみ全ON・その他全OFF」を常に維持する。
    if (SYS_ADMIN_ONLY_FEATURES.has(row.featureId)) continue;
    if (m[row.featureId]?.[row.role]) {
      m[row.featureId][row.role] = sanitizePermission(row.featureId, {
        canView: row.canView,
        canCreate: row.canCreate,
        canUpdate: row.canUpdate,
        canDelete: row.canDelete,
      });
    }
  }
  return m;
}

/**
 * 権限マトリクスの状態・取得・保存ロジック。
 * sibling 画面（system-settings / list-preferences）と同じく、保存アクションを
 * ページ側ヘッダーに置けるよう state をページに引き上げるための hook。
 * PermissionMatrix コンポーネントは matrix + onToggle を受け取る presentational に徹する。
 */
export function usePermissionMatrix() {
  const [matrix, setMatrix] = useState<MatrixData>({});
  const [features, setFeatures] = useState<LogicalFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(false);
  const requestGeneration = useRef(0);

  const loadMatrix = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(false);
    try {
      // 権限行とcatalogを同じ世代で確定する。片方だけ古い状態で描画・保存しない。
      const [permissionsResponse, objectTypes] = await Promise.all([
        apiClient.get('/permissions/roles'),
        fetchObjectTypesStrict(),
      ]);
      const rows = permissionsResponse.data.data;
      if (!Array.isArray(rows)) {
        throw new Error('Invalid role permissions response');
      }
      const nextFeatures = buildLogicalFeatures(objectTypes);
      if (generation !== requestGeneration.current) return;
      setFeatures(nextFeatures);
      setMatrix(buildMatrix(rows as PermissionRoleRow[], nextFeatures));
      setDirty(false);
    } catch {
      if (generation !== requestGeneration.current) return;
      setFeatures([]);
      setMatrix({});
      setDirty(false);
      setError(true);
      toast.error('権限情報の取得に失敗しました');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const handleToggle = useCallback(
    (featureId: string, role: string, action: keyof CrudPerm) => {
      if (role === 'SYS_ADMIN') return;
      if (SYS_ADMIN_ONLY_FEATURES.has(featureId)) return;
      if (!features.some((feature) => feature.id === featureId)) return;
      const currentPerm = matrix[featureId]?.[role];
      if (!currentPerm) return;
      if (isObjectTypePermissionId(featureId) && action !== 'canView' && !currentPerm.canView) {
        return;
      }
      setMatrix((prev) => {
        const next = { ...prev };
        const featurePerms = { ...next[featureId] };
        const rolePerm = { ...(prev[featureId]?.[role] ?? currentPerm) };
        rolePerm[action] = !rolePerm[action];
        if (isObjectTypePermissionId(featureId) && action === 'canView' && !rolePerm.canView) {
          rolePerm.canCreate = false;
          rolePerm.canUpdate = false;
          rolePerm.canDelete = false;
        }
        featurePerms[role] = rolePerm;
        next[featureId] = featurePerms;
        return next;
      });
      setDirty(true);
    },
    [features, matrix],
  );

  const handleSave = async () => {
    if (!dirty || error || loading) return;
    setSaving(true);
    try {
      const permissions: {
        role: string;
        featureId: string;
        canView: boolean;
        canCreate: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }[] = [];

      for (const feat of features) {
        for (const role of ALL_ROLES) {
          const perm = matrix[feat.id]?.[role];
          if (perm) {
            permissions.push({
              role,
              featureId: feat.id,
              ...sanitizePermission(feat.id, perm),
            });
          }
        }
      }

      await apiClient.put('/permissions/roles', { permissions });
      toast.success('権限を保存しました');
      setDirty(false);
    } catch {
      toast.error('権限の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return {
    matrix,
    features,
    loading,
    saving,
    dirty,
    error,
    reload: loadMatrix,
    handleToggle,
    handleSave,
  };
}
