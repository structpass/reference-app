'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CarrierForm } from '@/features/carriers';
import type { CarrierFormData } from '@/features/carriers';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'carrier-new-form';

export default function NewCarrierPage() {
  return (
    <FeatureGuard featureId="carriers" action="create">
      <NewCarrierPageBody />
    </FeatureGuard>
  );
}

function NewCarrierPageBody() {
  const { create } = useCrudApi('/carriers', '運送会社');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: CarrierFormData) => {
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
      router.push('/dashboard/carriers');
    }
  };

  return (
    <EditPageShell
      title="運送会社登録"
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
            onClick={() => router.push('/dashboard/carriers')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <CarrierForm
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
