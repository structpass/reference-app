'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Stocktaking } from '@struct-pass/shared';
import { StocktakingForm } from '@/features/stocktakings';
import type { StocktakingFormData } from '@/features/stocktakings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { PageShell } from '@/components/shared/page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';

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

  return (
    <PageShell title="棚卸登録">
      <FormCard>
        <StocktakingForm mode="create" onSubmit={handleSubmit} submitting={submitting} />
      </FormCard>
    </PageShell>
  );
}
