'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Carrier } from '@struct-pass/shared';
import { CarrierForm } from '@/features/carriers';
import type { CarrierFormData } from '@/features/carriers';
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

const FORM_ID = 'carrier-edit-form';

export default function EditCarrierPage() {
  return (
    <FeatureGuard featureId="carriers" action="update">
      <EditCarrierPageBody />
    </FeatureGuard>
  );
}

function EditCarrierPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<Carrier>('/carriers', '運送会社');
  const { item: carrier, loading } = useFetchOne<Carrier>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: CarrierFormData) => {
    if (!id) return;
    setSubmitting(true);
    await update(id, {
      ...data,
      address: data.address || undefined,
      phone: data.phone || undefined,
      contactPerson: data.contactPerson || undefined,
      email: data.email || undefined,
    });
    setSubmitting(false);
  };

  return (
    <EditPageShell
      title="運送会社編集"
      compact
      actions={
        loading || !carrier ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/carriers"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !carrier ? (
        <EditPageNotFound message="運送会社が見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <CarrierForm
              formId={FORM_ID}
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
              onSubmit={handleSubmit}
              mode="edit"
              loading={submitting}
            />
          </FormCard>
        </div>
      )}
    </EditPageShell>
  );
}
