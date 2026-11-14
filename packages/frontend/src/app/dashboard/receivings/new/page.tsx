'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Receiving } from '@struct-pass/shared';
import { ReceivingForm } from '@/features/receivings';
import type { ReceivingFormData } from '@/features/receivings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'receivings-new-form';

export default function NewReceivingPage() {
  return (
    <FeatureGuard featureId="receivings" action="create">
      <NewReceivingPageBody />
    </FeatureGuard>
  );
}

function NewReceivingPageBody() {
  const { create } = useCrudApi<Receiving, ReceivingFormData>('/receivings', '入荷');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: ReceivingFormData) => {
    setSubmitting(true);
    const ok = await create(data);
    setSubmitting(false);
    if (ok) {
      router.push('/dashboard/receivings');
    }
  };

  // 登録の導線はユーザー登録画面と同じく、画面右上のアクション行へ置く（d1163）。
  return (
    <EditPageShell
      title="入荷登録"
      compact
      actions={
        <EditPageActions
          formId={FORM_ID}
          submitLabel="入荷登録"
          submitting={submitting}
          listHref="/dashboard/receivings"
        />
      }
    >
      <FormCard>
        <ReceivingForm
          mode="create"
          onSubmit={handleSubmit}
          submitting={submitting}
          formId={FORM_ID}
          hideActions
        />
      </FormCard>
    </EditPageShell>
  );
}
