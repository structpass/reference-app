'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { List, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  EditPageLoader,
  EditPageNotFound,
  EditPageShell,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import {
  getObjectTypeRequestError,
  ObjectTypeForm,
  type ObjectTypeFormValues,
} from '@/features/object-types/components/object-type-form';
import {
  fetchObjectTypeByKey,
  updateObjectType,
  type ObjectTypeResponse,
} from '@/features/custom-ledger/lib/api';
import { invalidateObjectTypeCatalog } from '@/features/custom-ledger/lib/catalog-events';

const FORM_ID = 'object-type-edit-form';

export default function EditObjectTypePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return (
    <FeatureGuard featureId="object-types" action="update" fallbackPath="/dashboard/object-types">
      <EditObjectTypePageBody keyParam={key} />
    </FeatureGuard>
  );
}

function EditObjectTypePageBody({ keyParam }: { keyParam: string }) {
  const router = useRouter();
  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchObjectTypeByKey(keyParam).then((result) => {
      if (!active) return;
      setObjectType(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [keyParam]);

  const handleSubmit = async (values: ObjectTypeFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await updateObjectType(keyParam, {
        name: values.name,
        icon: values.icon || null,
        sortOrder: values.sortOrder,
        fieldDefs: values.fieldDefs.map(({ id: _id, ...field }) => field),
      });
      toast.success('台帳を更新しました');
      // 名称・アイコン・表示順の変更を同じ dashboard セッションの左メニューへ出す。key は不変で
      // 動的権限（object-type:<key>）の集合は変わらないため、取り直すのは catalog だけでよい。
      invalidateObjectTypeCatalog();
      router.push('/dashboard/object-types');
    } catch (requestError) {
      setError(getObjectTypeRequestError(requestError, '台帳の更新に失敗しました。'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <EditPageShell title="台帳を編集" compact actions={null}>
        <EditPageLoader />
      </EditPageShell>
    );
  }
  if (!objectType) {
    return (
      <EditPageShell title="台帳を編集" compact actions={null}>
        <EditPageNotFound message="指定された台帳が見つかりませんでした。" />
      </EditPageShell>
    );
  }
  if (objectType.isPreset) {
    return (
      <EditPageShell title="台帳を編集" compact actions={null}>
        <EditPageNotFound message="プリセットの構造は変更できません。" />
      </EditPageShell>
    );
  }

  const initialValues: ObjectTypeFormValues = {
    key: objectType.key,
    name: objectType.name,
    icon: objectType.icon ?? '',
    sortOrder: objectType.sortOrder,
    fieldDefs: (objectType.fieldDefs ?? []).map((field) => ({
      id: String(field.id),
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
    })),
  };

  return (
    <EditPageShell
      title="台帳を編集"
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
            key={objectType.key}
            formId={FORM_ID}
            mode="edit"
            initialValues={initialValues}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
