'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import type { TableId } from '@struct-pass/shared';
import { EditPageShell, EditPageLoader } from '@/components/shared/edit-page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import { ListPreferencesForm, useListPreferencesEditor } from '@/features/list-preferences';
import {
  type PageSizeDraft,
  isPageSizeDraftInvalid,
} from '@/features/list-preferences/lib/page-size-draft';

export default function ListPreferencesPage() {
  return (
    <FeatureGuard featureId="system-parameters" action="view" fallbackPath="/dashboard">
      <ListPreferencesPageBody />
    </FeatureGuard>
  );
}

function ListPreferencesPageBody() {
  const { settings, loading, error, bulkUpdate } = useListPreferencesEditor();
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PageSizeDraft>>({});

  // settings 参照が変わるたびに drafts を再初期化する（= 初回ロードと保存後 reload のみを想定）。
  // 将来フォーカス復帰時の再 fetch 等を足す場合、未保存ドラフトを消さないよう要注意。
  useEffect(() => {
    const initial: Record<string, PageSizeDraft> = {};
    for (const s of settings) {
      initial[s.tableId] = {
        defaultPageSize: s.defaultPageSize,
        pageSizeOptions: s.pageSizeOptions,
      };
    }
    setDrafts(initial);
  }, [settings]);

  const dirtyKeys = useMemo(
    () =>
      Object.keys(drafts).filter((tableId) => {
        const original = settings.find((s) => s.tableId === tableId);
        if (!original) return false;
        const draft = drafts[tableId];
        return (
          draft.defaultPageSize !== original.defaultPageSize ||
          draft.pageSizeOptions !== original.pageSizeOptions
        );
      }),
    [drafts, settings],
  );

  const hasInvalid = useMemo(
    () => Object.values(drafts).some((draft) => isPageSizeDraftInvalid(draft)),
    [drafts],
  );

  const handleChange = (tableId: string, field: keyof PageSizeDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [tableId]: {
        ...prev[tableId],
        [field]: field === 'defaultPageSize' ? Number(value) : value,
      },
    }));
  };

  const handleSave = async () => {
    if (dirtyKeys.length === 0 || hasInvalid) return;
    setSaving(true);
    try {
      await bulkUpdate(
        dirtyKeys.map((tableId) => ({
          tableId: tableId as TableId,
          defaultPageSize: drafts[tableId].defaultPageSize,
          pageSizeOptions: drafts[tableId].pageSizeOptions,
        })),
      );
      toast.success(`${dirtyKeys.length}件の設定を保存しました`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '保存に失敗しました';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      title="一覧設定（ページサイズ）"
      featureId="system-parameters"
      compact
      actions={
        <Button
          type="button"
          onClick={handleSave}
          variant="sp-action"
          size="sp-compact"
          loading={saving}
          disabled={dirtyKeys.length === 0 || hasInvalid}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {`保存（${dirtyKeys.length}件）`}
        </Button>
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
          {error}
        </div>
      ) : (
        <div data-form-compact>
          <ListPreferencesForm
            settings={settings}
            drafts={drafts}
            dirtyKeys={dirtyKeys}
            onChange={handleChange}
          />
        </div>
      )}
    </EditPageShell>
  );
}
