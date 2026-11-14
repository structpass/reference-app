'use client';

import { isObjectTypePermissionId } from '@struct-pass/shared';
import {
  FEATURE_CATEGORIES,
  getLogicalFeaturesByCategory,
  LOGICAL_FEATURES,
  type LogicalFeature,
} from '../lib/feature-list';
import {
  type CrudPerm,
  type MatrixData,
  ALL_ROLES,
  ROLE_LABELS,
  SYS_ADMIN_ONLY_FEATURES,
  createDefaultPerm,
} from '../lib/use-permission-matrix';
import { CrudCell } from './crud-cell';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';

interface PermissionMatrixProps {
  matrix: MatrixData;
  onToggle: (featureId: string, role: string, action: keyof CrudPerm) => void;
  features?: readonly LogicalFeature[];
}

/**
 * 権限マトリクス（presentational）。
 * 状態・取得・保存は `usePermissionMatrix` がページ側で保持し、保存ボタンは
 * EditPageShell のヘッダーに置く（sibling: system-settings / list-preferences と統一）。
 */
export function PermissionMatrix({
  matrix,
  onToggle,
  features = LOGICAL_FEATURES,
}: PermissionMatrixProps) {
  // 明細 hover 帯（ref-0038・rete mdl-0050 追随）。旧: hover:bg-[var(--sp-accent-soft)]
  // ＝メニュー用色系統の誤用（グローバルナビと同色になってしまっていた）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('tbody tr');

  return (
    <div className="space-y-6">
      <div
        ref={listRef}
        data-list-compact
        className="relative max-h-[70vh] overflow-x-auto overflow-y-auto border border-[var(--sp-line-warm)] bg-[var(--sp-card)]"
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th data-static className="relative h-8 min-w-[140px] px-4 text-left align-middle">
                カテゴリ
              </th>
              <th data-static className="relative h-8 min-w-[200px] px-4 text-left align-middle">
                機能名
              </th>
              {ALL_ROLES.map((role) => (
                <th
                  key={role}
                  data-static
                  className="relative h-8 min-w-[120px] px-2 text-center align-middle"
                >
                  {ROLE_LABELS[role]}
                  {role === 'SYS_ADMIN' && (
                    <span className="block text-xs font-normal normal-case tracking-normal text-[var(--sp-text-warm-mute)]">
                      (常にON)
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_CATEGORIES.flatMap((cat) => {
              const categoryFeatures = getLogicalFeaturesByCategory(cat.key, features);
              return categoryFeatures.map((feat, idx) => (
                <tr
                  key={feat.id}
                  className="sp-row-pillable border-b border-[var(--sp-line-warm-2)] last:border-b-0"
                >
                  <td
                    // カテゴリ列は行ごとのセルにし、見出しはグループの先頭行だけに出す（d1172）。
                    // rowSpan で1セルにまとめると、そのセルが先頭行の背景を全行へ塗ってしまい、
                    // 行の縞と行区切り線がカテゴリ列だけ途切れて一覧画面の表と揃わない。
                    className="px-4 py-2 align-top font-medium text-[var(--sp-text-warm)]"
                  >
                    {idx === 0 ? `${cat.key}. ${cat.label}` : null}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{feat.name}</span>
                    {feat.crudSupport.create === false && (
                      <span className="ml-2 text-xs text-[var(--sp-text-warm-mute)]">
                        (閲覧専用)
                      </span>
                    )}
                  </td>
                  {ALL_ROLES.map((role) => {
                    const perm = matrix[feat.id]?.[role] ?? createDefaultPerm();
                    const isSysAdminOnlyFeature = SYS_ADMIN_ONLY_FEATURES.has(feat.id);
                    // SYS_ADMIN は「常に ON」表示のため readOnly。
                    // SYS_ADMIN 専用機能は他 role でも編集を禁じる（matrix と seed/effective map の対称性保持）。
                    const isReadOnly = role === 'SYS_ADMIN' || isSysAdminOnlyFeature;
                    return (
                      <td key={role} className="px-2 py-2 text-center">
                        <CrudCell
                          canView={perm.canView}
                          canCreate={perm.canCreate}
                          canUpdate={perm.canUpdate}
                          canDelete={perm.canDelete}
                          crudSupport={feat.crudSupport}
                          readOnly={isReadOnly}
                          writeDisabled={isObjectTypePermissionId(feat.id) && !perm.canView}
                          onToggle={(action) => onToggle(feat.id, role, action)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
        {bandStyle ? (
          <div aria-hidden="true" className="sp-row-hoverband" style={bandStyle} />
        ) : null}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-6 text-xs text-[var(--sp-text-warm-mute)]">
        <span className="font-medium">凡例:</span>
        <span className="flex items-center gap-1">
          <span className="text-info">●</span>参照(R)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-success">●</span>登録(C)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-warning">●</span>修正(U)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-destructive">●</span>削除(D)
        </span>
        <span>| 色付き=ON / グレー=OFF</span>
      </div>
    </div>
  );
}
