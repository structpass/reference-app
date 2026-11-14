'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Stocktaking } from '@struct-pass/shared';
import { StocktakingForm } from '@/features/stocktakings';
import type { StocktakingFormData } from '@/features/stocktakings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'stocktakings-new-form';

export default function NewStocktakingPage() {
  return (
    <FeatureGuard featureId="stocktakings" action="create">
      <NewStocktakingPageBody />
    </FeatureGuard>
  );
}

function NewStocktakingPageBody() {
  const { create } = useCrudApi<Stocktaking, StocktakingFormData>('/stocktakings', '棚卸');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: StocktakingFormData) => {
    setSubmitting(true);
    const ok = await create(data);
    setSubmitting(false);
    if (ok) {
      router.push('/dashboard/stocktakings');
    }
  };

  // 登録の導線はユーザー登録画面と同じく、画面右上のアクション行へ置く（d1163）。
  return (
    <EditPageShell
      title="棚卸登録"
      compact
      actions={
        <EditPageActions
          formId={FORM_ID}
          submitLabel="棚卸登録"
          submitting={submitting}
          listHref="/dashboard/stocktakings"
        />
      }
    >
      <FormCard>
        <StocktakingForm
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
