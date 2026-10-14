'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SupplierForm } from '@/features/suppliers';
import type { SupplierFormData } from '@/features/suppliers';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'supplier-new-form';

export default function NewSupplierPage() {
  return (
    <FeatureGuard featureId="suppliers" action="create">
      <NewSupplierPageBody />
    </FeatureGuard>
  );
}

function NewSupplierPageBody() {
  const { create } = useCrudApi('/suppliers', '仕入先');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: SupplierFormData) => {
    setLoading(true);
    const ok = await create({
      ...data,
      address: data.address || undefined,
      phone: data.phone || undefined,
      contactPerson: data.contactPerson || undefined,
      email: data.email || undefined,
    });
    setLoading(false);
    if (ok) {
      router.push('/dashboard/suppliers');
    }
  };

  return (
    <EditPageShell
      title="仕入先登録"
      compact
      actions={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            variant="sp-action"
            size="sp-compact"
            tabIndex={-1}
            loading={loading}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            マスタ登録
          </Button>
          <Button
            type="button"
            variant="sp-action"
            size="sp-compact"
            tabIndex={-1}
            onClick={() => router.push('/dashboard/suppliers')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <SupplierForm
            formId={FORM_ID}
            hideActions
            mode="create"
            onSubmit={handleSubmit}
            loading={loading}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
