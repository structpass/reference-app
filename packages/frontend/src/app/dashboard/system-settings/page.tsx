'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { EditPageShell, EditPageLoader } from '@/components/shared/edit-page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import { SystemSettingsForm, useSystemSettings, useSystemConfig } from '@/features/system-settings';

export default function SystemSettingsPage() {
  return (
    <FeatureGuard featureId="system-parameters" action="view" fallbackPath="/dashboard">
      <SystemSettingsPageBody />
    </FeatureGuard>
  );
}

function SystemSettingsPageBody() {
  const { settings, loading, error, bulkUpdate } = useSystemSettings();
  const { reload: reloadPublicConfig } = useSystemConfig();
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // settings 参照が変わるたびに drafts を再初期化する（= 初回ロードと保存後 reload のみを想定）。
  // 将来フォーカス復帰時の再 fetch 等を足す場合、未保存ドラフトを消さないよう要注意。
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const s of settings) initial[s.key] = s.value;
    setDrafts(initial);
  }, [settings]);

  const dirtyKeys = useMemo(
    () => Object.keys(drafts).filter((k) => drafts[k] !== settings.find((s) => s.key === k)?.value),
    [drafts, settings],
  );

  const handleChange = (key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      await bulkUpdate(dirtyKeys.map((key) => ({ key, value: drafts[key] })));
      // SystemConfig も同セッションで即時反映するため reload
      await reloadPublicConfig();
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
      title="システム設定"
      featureId="system-parameters"
      compact
      actions={
        <Button
          type="button"
          onClick={handleSave}
          variant="sp-action"
          size="sp-compact"
          loading={saving}
          disabled={dirtyKeys.length === 0}
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
          <SystemSettingsForm
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
