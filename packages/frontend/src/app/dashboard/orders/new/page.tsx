'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Order } from '@struct-pass/shared';
import { OrderForm } from '@/features/orders';
import type { OrderFormData } from '@/features/orders';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'orders-new-form';

export default function NewOrderPage() {
  return (
    <FeatureGuard featureId="orders" action="create">
      <NewOrderPageBody />
    </FeatureGuard>
  );
}

function NewOrderPageBody() {
  const { create } = useCrudApi<Order, OrderFormData>('/orders', '発注');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: OrderFormData) => {
    setSubmitting(true);
    const ok = await create(data);
    setSubmitting(false);
    if (ok) {
      router.push('/dashboard/orders');
    }
  };

  // 登録の導線はユーザー登録画面と同じく、画面右上のアクション行へ置く（d1163）。
  return (
    <EditPageShell
      title="発注登録"
      compact
      actions={
        <EditPageActions
          formId={FORM_ID}
          submitLabel="発注登録"
          submitting={submitting}
          listHref="/dashboard/orders"
        />
      }
    >
      <FormCard>
        <OrderForm
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
