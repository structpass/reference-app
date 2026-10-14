'use client';

import { Save } from 'lucide-react';
import { EditPageShell, EditPageLoader } from '@/components/shared/edit-page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import { PermissionMatrix, usePermissionMatrix } from '@/features/permissions';

export default function PermissionsPage() {
  // featureId と URL path は一致するが、default fallback `/dashboard/permissions` だと
  // 自身に redirect する循環になるため `/dashboard` を明示する。
  return (
    <FeatureGuard featureId="permissions" action="view" fallbackPath="/dashboard">
      <PermissionsPageBody />
    </FeatureGuard>
  );
}

function PermissionsPageBody() {
  const { matrix, features, loading, saving, dirty, error, handleToggle, handleSave } =
    usePermissionMatrix();

  return (
    <EditPageShell
      title="機能別権限設定"
      featureId="permissions"
      compact
      actions={
        <Button
          type="button"
          onClick={handleSave}
          variant="sp-action"
          size="sp-compact"
          loading={saving}
          disabled={!dirty || error}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          権限を保存
        </Button>
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : error ? (
        <p role="alert" className="p-6 text-[var(--sp-text-warm-2)]">
          権限情報を読み込めないため、保存できません。
        </p>
      ) : (
        <PermissionMatrix matrix={matrix} features={features} onToggle={handleToggle} />
      )}
    </EditPageShell>
  );
}
