'use client';

import { useParams } from 'next/navigation';
import type { Warehouse } from '@struct-pass/shared';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import { WarehouseForm } from '@/features/warehouses';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { DetailPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewWarehousePage() {
  return (
    <FeatureGuard featureId="warehouses" action="view">
      <ViewWarehousePageBody />
    </FeatureGuard>
  );
}

function ViewWarehousePageBody() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { fetchOne } = useCrudApi<Warehouse>('/warehouses', '倉庫');
  const { item: warehouse, loading } = useFetchOne<Warehouse>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!warehouse) {
    return <EditPageNotFound message="倉庫が見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="倉庫詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/warehouses/${numericId}`}
          listHref="/dashboard/warehouses"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <WarehouseForm
            mode="view"
            id={numericId}
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
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
