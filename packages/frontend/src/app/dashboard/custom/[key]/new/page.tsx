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
import {
  createCustomRecord,
  fetchObjectTypeByKey,
  type FieldDefResponse,
} from '@/features/custom-ledger/lib/api';
import { toCustomRecordFormValues } from '@/features/custom-ledger/lib/custom-record-schema';
import { extractErrorMessage } from '@/lib/error-utils';

const FORM_ID = 'custom-record-new-form';

export default function NewCustomRecordPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return (
    <ObjectTypeFeatureGuard keyParam={key} action="create" fallbackPath="/dashboard">
      <NewCustomRecordPageBody keyParam={key} />
    </ObjectTypeFeatureGuard>
  );
}

function NewCustomRecordPageBody({ keyParam }: { keyParam: string }) {
  const router = useRouter();
  const [ledgerName, setLedgerName] = useState('');
  const [fieldDefs, setFieldDefs] = useState<FieldDefResponse[] | null>(null);
  const [isPreset, setIsPreset] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const listHref = `/dashboard/custom/${encodeURIComponent(keyParam)}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFieldDefs(null);
    void fetchObjectTypeByKey(keyParam).then((objectType) => {
      if (!active) return;
      if (!objectType) {
        toast.error('指定された台帳が見つかりません。');
        setLoading(false);
        return;
      }
      setLedgerName(objectType.name);
      setIsPreset(objectType.isPreset);
      setFieldDefs(objectType.fieldDefs ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [keyParam]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await createCustomRecord(keyParam, { data });
      toast.success('レコードを登録しました');
      router.push(listHref);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'レコードの登録に失敗しました。'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <EditPageShell title="レコードを登録" compact actions={null}>
        <EditPageLoader />
      </EditPageShell>
    );
  }
  if (fieldDefs === null) {
    return (
      <EditPageShell title="レコードを登録" compact actions={null}>
        <EditPageNotFound message="指定された台帳が見つかりませんでした。" />
      </EditPageShell>
    );
  }
  if (isPreset) {
    return (
      <EditPageShell title="レコードを登録" compact actions={null}>
        <EditPageNotFound message="プリセット台帳にはレコードを登録できません。" />
      </EditPageShell>
    );
  }

  return (
    <EditPageShell
      title={`${ledgerName}のレコードを登録`}
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
            formId={FORM_ID}
            fieldDefs={fieldDefs}
            initialValues={toCustomRecordFormValues(fieldDefs, {})}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
