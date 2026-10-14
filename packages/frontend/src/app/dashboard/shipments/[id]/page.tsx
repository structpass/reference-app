'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShipmentForm } from '@/features/shipments';
import type { ShipmentFormData, ShipmentWithLines } from '@/features/shipments';
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

const FORM_ID = 'shipment-edit-form';

export default function EditShipmentPage() {
  return (
    <FeatureGuard featureId="shipments" action="update">
      <EditShipmentPageBody />
    </FeatureGuard>
  );
}

function EditShipmentPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<ShipmentWithLines, ShipmentFormData>(
    '/shipments',
    '出荷',
  );
  const router = useRouter();
  const { item: doc, loading } = useFetchOne<ShipmentWithLines>(fetchOne, id, (d) => {
    if (d.status !== 'DRAFT') {
      router.replace(`/dashboard/shipments/${id}/view`);
      return 'skip-set';
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: ShipmentFormData) => {
    if (!id) return;
    setSubmitting(true);
    await update(id, data);
    setSubmitting(false);
  };

  return (
    <EditPageShell
      title="出荷編集"
      compact
      actions={
        loading || !doc ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="出荷更新"
            submitting={submitting}
            listHref="/dashboard/shipments"
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !doc ? (
        <EditPageNotFound message="出荷データが見つかりませんでした" />
      ) : (
        <FormCard>
          <ShipmentForm
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
