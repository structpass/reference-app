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
import { LoadFailed } from '@/components/shared/load-failed';
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
  const {
    item: product,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<Product>(fetchProduct, id);

  // 再試行の間はローダーへ戻さない（失敗の表示のその場で処理中を出す・d1039）。
  if (loading && !retrying) {
    return <EditPageLoader />;
  }

  if (loadError || retrying) {
    return (
      <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={retrying} />
    );
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
              // 詳細も編集と同じ初期値を出す（未設定は null なので空欄にする）。
              purchasePrice: product.purchasePrice ?? undefined,
              unit: product.unit ?? '',
              status: product.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
