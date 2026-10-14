'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  EditPageLoader,
  EditPageNotFound,
  EditPageShell,
} from '@/components/shared/edit-page-shell';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FormCard } from '@/components/shared/form-card';
import { ObjectTypeFeatureGuard } from '@/components/shared/feature-guard';
import { CustomRecordForm } from '@/features/custom-ledger/components/custom-record-form';
import { LoadFailed } from '@/features/custom-ledger/components/load-failed';
import {
  fetchCustomRecord,
  fetchObjectTypeByKey,
  updateCustomRecord,
  type CustomRecordResponse,
  type FieldDefResponse,
  type ObjectTypeResponse,
} from '@/features/custom-ledger/lib/api';
import { toCustomRecordFormValues } from '@/features/custom-ledger/lib/custom-record-schema';
import { extractErrorMessage } from '@/lib/error-utils';

const FORM_ID = 'custom-record-edit-form';

export default function EditCustomRecordPage({
  params,
}: {
  params: Promise<{ key: string; id: string }>;
}) {
  const { key, id } = use(params);
  return (
    <ObjectTypeFeatureGuard keyParam={key} action="update" fallbackPath="/dashboard">
      <EditCustomRecordPageBody keyParam={key} recordId={id} />
    </ObjectTypeFeatureGuard>
  );
}

function EditCustomRecordPageBody({ keyParam, recordId }: { keyParam: string; recordId: string }) {
  const router = useRouter();
  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [fieldDefs, setFieldDefs] = useState<FieldDefResponse[] | null>(null);
  const [record, setRecord] = useState<CustomRecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  const listHref = `/dashboard/custom/${encodeURIComponent(keyParam)}`;

  // 対象レコードは単体取得 API で引く（一覧のページ窓や画面内キャッシュに依存しない）。
  // これにより 2 ページ目以降のレコードでも直接 URL・再読み込みで編集画面が開く。
  useEffect(() => {
    let active = true;
    setLoading(true);
    setObjectType(null);
    setFieldDefs(null);
    setRecord(null);
    setLoadError(false);

    void Promise.all([fetchObjectTypeByKey(keyParam), fetchCustomRecord(keyParam, recordId)]).then(
      ([type, result]) => {
        if (!active) return;
        // 読み取り失敗は「見つかりません」と区別する（実データがあるのに不在と断定しない）。
        if (result.status === 'error') {
          setLoadError(true);
          setLoading(false);
          return;
        }
        if (!type || result.status === 'not_found') {
          toast.error('指定された台帳またはレコードが見つかりません。');
          setLoading(false);
          return;
        }
        setObjectType(type);
        setFieldDefs(type.fieldDefs ?? []);
        setRecord(result.record);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [keyParam, recordId, reloadVersion]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await updateCustomRecord(keyParam, recordId, { data });
      toast.success('レコードを更新しました');
      router.push(listHref);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'レコードの更新に失敗しました。'));
    } finally {
      setSubmitting(false);
    }
  };

  // 再試行は押した瞬間に処理中へ倒す（読み込み表示へ切り替わり、連打で重複取得しない）。
  const retryLoad = () => {
    setLoading(true);
    setReloadVersion((version) => version + 1);
  };

  if (loading) {
    return (
      <EditPageShell title="レコードを編集" compact actions={null}>
        <EditPageLoader />
      </EditPageShell>
    );
  }
  if (loadError) {
    return (
      <EditPageShell title="レコードを編集" compact actions={null}>
        <LoadFailed message="レコードの読み込みに失敗しました。" onRetry={retryLoad} />
      </EditPageShell>
    );
  }
  if (!objectType || !record || fieldDefs === null) {
    // プリセット台帳は単体取得が 404 を返す（専用マスタが正本でレコードを持たない）ため、
    // ここへ合流する。プリセット専用の分岐は持たない（records を返す経路が無く、到達しない）。
    return (
      <EditPageShell title="レコードを編集" compact actions={null}>
        <EditPageNotFound message="指定された台帳またはレコードが見つかりませんでした。" />
      </EditPageShell>
    );
  }

  return (
    <EditPageShell
      title={`${objectType.name}のレコードを編集`}
      compact
      actions={
        <EditPageActions
          formId={FORM_ID}
          submitLabel="保存"
          submitting={submitting}
          listHref={listHref}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <CustomRecordForm
            key={record.id}
            formId={FORM_ID}
            fieldDefs={fieldDefs}
            initialValues={toCustomRecordFormValues(fieldDefs, record.data)}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
