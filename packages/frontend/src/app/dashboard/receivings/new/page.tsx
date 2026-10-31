'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Receiving } from '@struct-pass/shared';
import { ReceivingForm } from '@/features/receivings';
import type { ReceivingFormData } from '@/features/receivings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { PageShell } from '@/components/shared/page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';

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

  return (
    <PageShell title="入荷登録">
      <FormCard>
        <ReceivingForm mode="create" onSubmit={handleSubmit} submitting={submitting} />
      </FormCard>
    </PageShell>
  );
}
