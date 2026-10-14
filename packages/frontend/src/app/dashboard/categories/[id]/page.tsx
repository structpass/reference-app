'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Category } from '@struct-pass/shared';
import { CategoryForm } from '@/features/categories';
import type { CategoryFormData } from '@/features/categories';
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

const FORM_ID = 'category-edit-form';

export default function EditCategoryPage() {
  return (
    <FeatureGuard featureId="categories" action="update">
      <EditCategoryPageBody />
    </FeatureGuard>
  );
}

function EditCategoryPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<Category>('/categories', 'カテゴリー');
  const { item: category, loading } = useFetchOne<Category>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: CategoryFormData) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await update(id, data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EditPageShell
      title="カテゴリー編集"
      compact
      actions={
        loading || !category ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/categories"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !category ? (
        <EditPageNotFound message="カテゴリーが見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <CategoryForm
              formId={FORM_ID}
              hideActions
              defaultValues={{
                code: category.code,
                name: category.name,
                status: category.status,
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
