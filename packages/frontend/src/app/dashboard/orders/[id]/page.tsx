'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OrderForm } from '@/features/orders';
import type { OrderFormData, OrderWithItems } from '@/features/orders';
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

const FORM_ID = 'order-edit-form';

export default function EditOrderPage() {
  return (
    <FeatureGuard featureId="orders" action="update">
      <EditOrderPageBody />
    </FeatureGuard>
  );
}

function EditOrderPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<OrderWithItems, OrderFormData>('/orders', '発注');
  const router = useRouter();
  const { item: doc, loading } = useFetchOne<OrderWithItems>(fetchOne, id, (d) => {
    if (d.status !== 'DRAFT') {
      router.replace(`/dashboard/orders/${id}/view`);
      return 'skip-set';
    }
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: OrderFormData) => {
    if (!id) return;
    setSubmitting(true);
    await update(id, data);
    setSubmitting(false);
  };

  return (
    <EditPageShell
      title="発注編集"
      compact
      actions={
        loading || !doc ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="発注更新"
            submitting={submitting}
            listHref="/dashboard/orders"
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !doc ? (
        <EditPageNotFound message="発注データが見つかりませんでした" />
      ) : (
        <FormCard>
          <OrderForm
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
