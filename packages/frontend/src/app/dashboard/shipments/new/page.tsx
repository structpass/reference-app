'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Shipment } from '@struct-pass/shared';
import { ShipmentForm } from '@/features/shipments';
import type { ShipmentFormData } from '@/features/shipments';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'shipments-new-form';

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

  // 登録の導線はユーザー登録画面と同じく、画面右上のアクション行へ置く（d1163）。
  return (
    <EditPageShell
      title="出荷登録"
      compact
      actions={
        <EditPageActions
          formId={FORM_ID}
          submitLabel="出荷登録"
          submitting={submitting}
          listHref="/dashboard/shipments"
        />
      }
    >
      <FormCard>
        <ShipmentForm
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
