'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StocktakingForm } from '@/features/stocktakings';
import type { StocktakingFormData, StocktakingWithItems } from '@/features/stocktakings';
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

const FORM_ID = 'stocktaking-edit-form';

export default function EditStocktakingPage() {
  return (
    <FeatureGuard featureId="stocktakings" action="update">
      <EditStocktakingPageBody />
    </FeatureGuard>
  );
}

function EditStocktakingPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<StocktakingWithItems, StocktakingFormData>(
    '/stocktakings',
    '棚卸',
  );
  const router = useRouter();
  const { item: doc, loading } = useFetchOne<StocktakingWithItems>(fetchOne, id, (d) => {
    if (d.status !== 'DRAFT') {
      router.replace(`/dashboard/stocktakings/${id}/view`);
      return 'skip-set';
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: StocktakingFormData) => {
    if (!id) return;
    setSubmitting(true);
    await update(id, data);
    setSubmitting(false);
  };

  return (
    <EditPageShell
      title="棚卸編集"
      compact
      actions={
        loading || !doc ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="棚卸更新"
            submitting={submitting}
            listHref="/dashboard/stocktakings"
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !doc ? (
        <EditPageNotFound message="棚卸データが見つかりませんでした" />
      ) : (
        <FormCard>
          <StocktakingForm
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
