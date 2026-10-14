'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReceivingForm } from '@/features/receivings';
import type { ReceivingFormData, ReceivingWithLines } from '@/features/receivings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'receiving-edit-form';

export default function EditReceivingPage() {
  return (
    <FeatureGuard featureId="receivings" action="update">
      <EditReceivingPageBody />
    </FeatureGuard>
  );
}

function EditReceivingPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<ReceivingWithLines, ReceivingFormData>(
    '/receivings',
    '入荷',
  );
  const router = useRouter();
  const { item: doc, loading } = useFetchOne<ReceivingWithLines>(fetchOne, id, (d) => {
    if (d.status !== 'DRAFT') {
      router.replace(`/dashboard/receivings/${id}/view`);
      return 'skip-set';
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: ReceivingFormData) => {
    if (!id) return;
    setSubmitting(true);
    const ok = await update(id, data);
    setSubmitting(false);
    if (ok) {
      // 更新完了トーストを表示し、編集画面に留まる
    }
  };

  return (
    <EditPageShell
      title="入荷編集"
      compact
      actions={
        loading || !doc ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="入荷更新"
            submitting={submitting}
            listHref="/dashboard/receivings"
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !doc ? (
        <EditPageNotFound message="入荷データが見つかりませんでした" />
      ) : (
        <FormCard>
          <ReceivingForm
            mode="edit"
            document={doc}
            onSubmit={handleSubmit}
            submitting={submitting}
            formId={FORM_ID}
            hideActions
          />
        </FormCard>
      )}
    </EditPageShell>
  );
}
