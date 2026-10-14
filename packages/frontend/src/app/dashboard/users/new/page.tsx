'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserForm } from '@/features/users';
import type { UserFormSubmitData } from '@/features/users';
import { useCrudApi } from '@/hooks/use-crud-api';
import type { User } from '@struct-pass/shared';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'user-new-form';

export default function NewUserPage() {
  return (
    <FeatureGuard featureId="users" action="create">
      <NewUserPageBody />
    </FeatureGuard>
  );
}

function NewUserPageBody() {
  const { create } = useCrudApi<User>('/users', 'ユーザー');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: UserFormSubmitData) => {
    setLoading(true);
    const ok = await create({
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    });
    setLoading(false);
    if (ok) {
      router.push('/dashboard/users');
    }
  };

  return (
    <EditPageShell
      title="ユーザー登録"
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
            onClick={() => router.push('/dashboard/users')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <UserForm
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
