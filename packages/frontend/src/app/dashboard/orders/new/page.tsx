'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Order } from '@struct-pass/shared';
import { OrderForm } from '@/features/orders';
import type { OrderFormData } from '@/features/orders';
import { useCrudApi } from '@/hooks/use-crud-api';
import { PageShell } from '@/components/shared/page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';

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

  return (
    <PageShell title="発注登録">
      <FormCard>
        <OrderForm mode="create" onSubmit={handleSubmit} submitting={submitting} />
      </FormCard>
    </PageShell>
  );
}
