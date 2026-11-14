'use client';

import { useParams } from 'next/navigation';
import type { Supplier } from '@struct-pass/shared';
import { SupplierForm } from '@/features/suppliers';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { LoadFailed } from '@/components/shared/load-failed';
import { DetailPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewSupplierPage() {
  return (
    <FeatureGuard featureId="suppliers" action="view">
      <ViewSupplierPageBody />
    </FeatureGuard>
  );
}

function ViewSupplierPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<Supplier>('/suppliers', '仕入先');
  const {
    item: supplier,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<Supplier>(fetchOne, id);

  // 再試行の間はローダーへ戻さない（失敗の表示のその場で処理中を出す・d1039）。
  if (loading && !retrying) {
    return <EditPageLoader />;
  }

  if (loadError || retrying) {
    return (
      <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={retrying} />
    );
  }

  if (!supplier) {
    return <EditPageNotFound message="仕入先が見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="仕入先詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/suppliers/${id}`}
          listHref="/dashboard/suppliers"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <SupplierForm
            mode="view"
            id={id}
            hideActions
            defaultValues={{
              code: supplier.code,
              name: supplier.name,
              address: supplier.address || '',
              phone: supplier.phone || '',
              contactPerson: supplier.contactPerson || '',
              email: supplier.email || '',
              status: supplier.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
