'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Supplier } from '@struct-pass/shared';
import { SupplierForm } from '@/features/suppliers';
import type { SupplierFormData } from '@/features/suppliers';
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

const FORM_ID = 'supplier-edit-form';

export default function EditSupplierPage() {
  return (
    <FeatureGuard featureId="suppliers" action="update">
      <EditSupplierPageBody />
    </FeatureGuard>
  );
}

function EditSupplierPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<Supplier>('/suppliers', '仕入先');
  const { item: supplier, loading } = useFetchOne<Supplier>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: SupplierFormData) => {
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
      title="仕入先編集"
      compact
      actions={
        loading || !supplier ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/suppliers"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !supplier ? (
        <EditPageNotFound message="仕入先が見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <SupplierForm
              formId={FORM_ID}
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
