'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { List, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import {
  getObjectTypeRequestError,
  ObjectTypeForm,
  type ObjectTypeFormValues,
} from '@/features/object-types/components/object-type-form';
import { createObjectType } from '@/features/custom-ledger/lib/api';
import { invalidateObjectTypeCatalog } from '@/features/custom-ledger/lib/catalog-events';
import { usePermissionsContext } from '@/contexts/permissions-provider';

const FORM_ID = 'object-type-new-form';

export default function NewObjectTypePage() {
  return (
    <FeatureGuard featureId="object-types" action="create" fallbackPath="/dashboard">
      <NewObjectTypePageBody />
    </FeatureGuard>
  );
}

function NewObjectTypePageBody() {
  const router = useRouter();
  const { refresh: refreshPermissions } = usePermissionsContext();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: ObjectTypeFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await createObjectType({
        key: values.key,
        name: values.name,
        icon: values.icon || undefined,
        sortOrder: values.sortOrder,
        fieldDefs: values.fieldDefs.map(({ id: _id, ...field }) => field),
      });
      toast.success('台帳を作成しました');
      // 台帳の追加は左メニューの catalog と、台帳ごとの動的権限（object-type:<key>）の集合を変える。
      // 同じ dashboard セッションの左メニューが保存結果を出すよう、両方のキャッシュを無効化してから戻る。
      invalidateObjectTypeCatalog();
      void refreshPermissions();
      router.push('/dashboard/object-types');
    } catch (requestError) {
      setError(getObjectTypeRequestError(requestError, '台帳の作成に失敗しました。'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EditPageShell
      title="台帳を作成"
      compact
      actions={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            variant="sp-action"
            size="sp-compact"
            loading={submitting}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            保存
          </Button>
          <Button
            type="button"
            variant="sp-action"
            size="sp-compact"
            onClick={() => router.push('/dashboard/object-types')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <ObjectTypeForm
            formId={FORM_ID}
            mode="create"
            initialValues={{ key: '', name: '', icon: '', sortOrder: 0, fieldDefs: [] }}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
