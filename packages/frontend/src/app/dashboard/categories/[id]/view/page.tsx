'use client';

import { useParams } from 'next/navigation';
import type { Category } from '@struct-pass/shared';
import { CategoryForm } from '@/features/categories';
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

export default function ViewCategoryPage() {
  return (
    <FeatureGuard featureId="categories" action="view">
      <ViewCategoryPageBody />
    </FeatureGuard>
  );
}

function ViewCategoryPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<Category>('/categories', 'カテゴリー');
  const { item: category, loading, loadError, reload } = useFetchOne<Category>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (loadError) {
    return (
      <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={loading} />
    );
  }

  if (!category) {
    return <EditPageNotFound message="カテゴリーが見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="カテゴリー詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/categories/${id}`}
          listHref="/dashboard/categories"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <CategoryForm
            mode="view"
            id={id}
            hideActions
            defaultValues={{
              code: category.code,
              name: category.name,
              status: category.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
