'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Warehouse } from '@struct-pass/shared';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import { WarehouseForm } from '@/features/warehouses';
import type { WarehouseFormData } from '@/features/warehouses';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'warehouse-edit-form';

export default function EditWarehousePage() {
  return (
    <FeatureGuard featureId="warehouses" action="update">
      <EditWarehousePageBody />
    </FeatureGuard>
  );
}

function EditWarehousePageBody() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { fetchOne, update } = useCrudApi<Warehouse>('/warehouses', '倉庫');
  const { item: warehouse, loading } = useFetchOne<Warehouse>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: WarehouseFormData) => {
    if (!numericId) return;
    setSubmitting(true);
    await update(numericId, {
      ...data,
      address: data.address || undefined,
      phone: data.phone || undefined,
      manager: data.manager || undefined,
      capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
    });
    setSubmitting(false);
  };

  return (
    <EditPageShell
      title="倉庫編集"
      compact
      actions={
        loading || !warehouse ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/warehouses"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !warehouse ? (
        <EditPageNotFound message="倉庫が見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <WarehouseForm
              formId={FORM_ID}
              hideActions
              defaultValues={{
                code: warehouse.code,
                name: warehouse.name,
                address: warehouse.address || '',
                phone: warehouse.phone || '',
                manager: warehouse.manager || '',
                capacity: warehouse.capacity ?? undefined,
                status: warehouse.status,
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
