'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WarehouseForm } from '@/features/warehouses';
import type { WarehouseFormData } from '@/features/warehouses';
import { useCrudApi } from '@/hooks/use-crud-api';
import type { Warehouse } from '@struct-pass/shared';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'warehouse-new-form';

export default function NewWarehousePage() {
  return (
    <FeatureGuard featureId="warehouses" action="create">
      <NewWarehousePageBody />
    </FeatureGuard>
  );
}

function NewWarehousePageBody() {
  const { create } = useCrudApi<Warehouse>('/warehouses', '倉庫');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: WarehouseFormData) => {
    setLoading(true);
    const ok = await create({
      ...data,
      address: data.address || undefined,
      phone: data.phone || undefined,
      manager: data.manager || undefined,
      capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
    });
    setLoading(false);
    if (ok) router.push('/dashboard/warehouses');
  };

  return (
    <EditPageShell
      title="倉庫登録"
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
            onClick={() => router.push('/dashboard/warehouses')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <WarehouseForm
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
