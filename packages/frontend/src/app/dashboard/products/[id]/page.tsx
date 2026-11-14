'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Product } from '@struct-pass/shared';
import { ProductForm, useProducts } from '@/features/products';
import type { ProductFormData } from '@/features/products';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { LoadFailed } from '@/components/shared/load-failed';
import { EditPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

const FORM_ID = 'product-edit-form';

export default function EditProductPage() {
  return (
    <FeatureGuard featureId="products" action="update">
      <EditProductPageBody />
    </FeatureGuard>
  );
}

function EditProductPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchProduct, updateProduct } = useProducts();
  const {
    item: product,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<Product>(fetchProduct, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: ProductFormData) => {
    if (!id) return;
    setSubmitting(true);
    const ok = await updateProduct(id, {
      ...data,
      description: data.description || undefined,
      purchasePrice: typeof data.purchasePrice === 'number' ? data.purchasePrice : null,
      unit: data.unit || undefined,
    });
    setSubmitting(false);
    if (ok) {
      // 更新完了トーストを表示し、編集画面に留まる
    }
  };

  return (
    <EditPageShell
      title="商品編集"
      compact
      actions={
        loading || !product ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/products"
            tabIndex={-1}
          />
        )
      }
    >
      {loading && !retrying ? (
        <EditPageLoader />
      ) : loadError || retrying ? (
        <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={retrying} />
      ) : !product ? (
        <EditPageNotFound message="商品が見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <ProductForm
              formId={FORM_ID}
              hideActions
              defaultValues={{
                code: product.code,
                name: product.name,
                description: product.description || '',
                categoryId: product.categoryId,
                price: Number(product.price),
                // 既存の値と単位を初期表示する（未設定は null なので空欄にする）。
                purchasePrice: product.purchasePrice ?? undefined,
                unit: product.unit ?? '',
                status: product.status,
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
