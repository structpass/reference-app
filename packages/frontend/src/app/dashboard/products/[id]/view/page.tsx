'use client';

import { useParams } from 'next/navigation';
import type { Product } from '@struct-pass/shared';
import { ProductForm, useProducts } from '@/features/products';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { DetailPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewProductPage() {
  return (
    <FeatureGuard featureId="products" action="view">
      <ViewProductPageBody />
    </FeatureGuard>
  );
}

function ViewProductPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchProduct } = useProducts();
  const { item: product, loading } = useFetchOne<Product>(fetchProduct, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!product) {
    return <EditPageNotFound message="商品が見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="商品詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/products/${id}`}
          listHref="/dashboard/products"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <ProductForm
            mode="view"
            id={id}
            hideActions
            defaultValues={{
              code: product.code,
              name: product.name,
              description: product.description || '',
              categoryId: product.categoryId,
              price: Number(product.price),
              status: product.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
