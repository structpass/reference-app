'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, useProducts } from '@/features/products';
import type { ProductFormData } from '@/features/products';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Button } from '@/components/ui/button';
import { List, Save } from 'lucide-react';

const FORM_ID = 'product-new-form';

export default function NewProductPage() {
  return (
    <FeatureGuard featureId="products" action="create">
      <NewProductPageBody />
    </FeatureGuard>
  );
}

function NewProductPageBody() {
  const { createProduct } = useProducts();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: ProductFormData) => {
    setLoading(true);
    const ok = await createProduct({
      ...data,
      description: data.description || undefined,
      purchasePrice: typeof data.purchasePrice === 'number' ? data.purchasePrice : undefined,
      unit: data.unit || undefined,
    });
    setLoading(false);
    if (ok) {
      router.push('/dashboard/products');
    }
  };

  return (
    <EditPageShell
      title="商品登録"
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
            onClick={() => router.push('/dashboard/products')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <ProductForm
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
