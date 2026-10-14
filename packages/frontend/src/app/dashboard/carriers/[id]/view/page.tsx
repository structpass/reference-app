'use client';

import { useParams } from 'next/navigation';
import type { Carrier } from '@struct-pass/shared';
import { CarrierForm } from '@/features/carriers';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { DetailPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewCarrierPage() {
  return (
    <FeatureGuard featureId="carriers" action="view">
      <ViewCarrierPageBody />
    </FeatureGuard>
  );
}

function ViewCarrierPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<Carrier>('/carriers', '運送会社');
  const { item: carrier, loading } = useFetchOne<Carrier>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!carrier) {
    return <EditPageNotFound message="運送会社が見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="運送会社詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/carriers/${id}`}
          listHref="/dashboard/carriers"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <CarrierForm
            mode="view"
            id={id}
            hideActions
            defaultValues={{
              code: carrier.code,
              name: carrier.name,
              address: carrier.address || '',
              phone: carrier.phone || '',
              contactPerson: carrier.contactPerson || '',
              email: carrier.email || '',
              status: carrier.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
