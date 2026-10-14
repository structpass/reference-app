'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormCard } from '@/components/shared/form-card';
import { PageShell } from '@/components/shared/page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { usePermissions } from '@/hooks/use-permissions';
import {
  fetchObjectTypeByKey,
  fetchObjectTypes,
  type ObjectTypeResponse,
} from '@/features/custom-ledger/lib/api';

export default function ObjectTypesPage() {
  return (
    <FeatureGuard featureId="object-types" action="view" fallbackPath="/dashboard">
      <ObjectTypesPageBody />
    </FeatureGuard>
  );
}

function ObjectTypesPageBody() {
  const router = useRouter();
  const { canCreate, canUpdate } = usePermissions();
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchObjectTypes().then(async (types) => {
      if (!active) return;
      // findAll は一覧用の軽量レスポンスのため、管理画面だけ項目数を補完する。
      const detailedTypes = await Promise.all(
        types.map(async (type) => (await fetchObjectTypeByKey(type.key)) ?? type),
      );
      if (!active) return;
      setObjectTypes(detailedTypes);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const sortedObjectTypes = useMemo(
    () =>
      [...objectTypes].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja'),
      ),
    [objectTypes],
  );

  return (
    <PageShell
      title="台帳管理"
      actions={
        canCreate('object-types') ? (
          <Button
            type="button"
            variant="sp-action"
            size="sp-compact"
            onClick={() => router.push('/dashboard/object-types/new')}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            台帳を作成
          </Button>
        ) : undefined
      }
    >
      <FormCard className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-[var(--sp-line-warm)] bg-[var(--sp-paper-2)] px-4 py-3">
          <TableProperties className="h-4 w-4 text-[var(--sp-accent-ink)]" />
          <p className="text-sm text-[var(--sp-text-warm-mute)]">
            プリセットとユーザー定義台帳の構造を管理します。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="台帳一覧">
            <thead className="border-b border-[var(--sp-line-warm)] bg-[var(--sp-paper-2)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[var(--sp-text-warm)]">
                  台帳名
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--sp-text-warm)]">
                  キー
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--sp-text-warm)]">
                  項目数
                </th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--sp-text-warm)]">
                  種別
                </th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--sp-text-warm)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-[var(--sp-text-warm-mute)]"
                  >
                    読み込み中…
                  </td>
                </tr>
              ) : sortedObjectTypes.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-[var(--sp-text-warm-mute)]"
                  >
                    台帳がありません。
                  </td>
                </tr>
              ) : (
                sortedObjectTypes.map((objectType) => (
                  <tr key={objectType.key} className="border-t border-[var(--sp-line-warm-2)]">
                    <td className="px-4 py-3 font-medium text-[var(--sp-text-warm)]">
                      {objectType.icon && (
                        <span className="mr-2 text-[var(--sp-accent-ink)]">{objectType.icon}</span>
                      )}
                      {objectType.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--sp-text-warm-mute)]">
                      {objectType.key}
                    </td>
                    <td className="px-4 py-3 text-[var(--sp-text-warm-mute)]">
                      {objectType.fieldDefs?.length ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {objectType.isPreset ? (
                        <span className="rounded-full bg-[var(--sp-paper-2)] px-2 py-1 text-xs text-[var(--sp-text-warm-mute)]">
                          プリセット
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--sp-accent-soft)] px-2 py-1 text-xs text-[var(--sp-accent-ink)]">
                          ユーザー定義
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {objectType.isPreset ? (
                        <span className="text-xs text-[var(--sp-text-warm-mute)]">
                          構造変更不可
                        </span>
                      ) : canUpdate('object-types') ? (
                        <Button
                          type="button"
                          variant="sp-action"
                          size="sp-compact"
                          onClick={() =>
                            router.push(`/dashboard/object-types/${objectType.key}/edit`)
                          }
                        >
                          編集
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </FormCard>
    </PageShell>
  );
}
