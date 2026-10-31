'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CategoryForm } from '@/features/categories';
import type { CategoryFormData } from '@/features/categories';
import { useCrudApi } from '@/hooks/use-crud-api';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'category-new-form';

export default function NewCategoryPage() {
  return (
    <FeatureGuard featureId="categories" action="create">
      <NewCategoryPageBody />
    </FeatureGuard>
  );
}

function NewCategoryPageBody() {
  const { create } = useCrudApi('/categories', 'カテゴリー');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: CategoryFormData) => {
    setLoading(true);
    const ok = await create(data);
    setLoading(false);
    if (ok) {
      router.push('/dashboard/categories');
    }
  };

  return (
    <EditPageShell
      title="カテゴリー登録"
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
            onClick={() => router.push('/dashboard/categories')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <CategoryForm
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
