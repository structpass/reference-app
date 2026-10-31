'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Shipment } from '@struct-pass/shared';
import { ShipmentForm } from '@/features/shipments';
import type { ShipmentFormData } from '@/features/shipments';
import { useCrudApi } from '@/hooks/use-crud-api';
import { PageShell } from '@/components/shared/page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function NewShipmentPage() {
  return (
    <FeatureGuard featureId="shipments" action="create">
      <NewShipmentPageBody />
    </FeatureGuard>
  );
}

function NewShipmentPageBody() {
  const { create } = useCrudApi<Shipment, ShipmentFormData>('/shipments', '出荷');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: ShipmentFormData) => {
    setSubmitting(true);
    const ok = await create(data);
    setSubmitting(false);
    if (ok) {
      router.push('/dashboard/shipments');
    }
  };

  return (
    <PageShell title="出荷登録">
      <FormCard>
        <ShipmentForm mode="create" onSubmit={handleSubmit} submitting={submitting} />
      </FormCard>
    </PageShell>
  );
}
