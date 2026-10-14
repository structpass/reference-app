'use client';

import { useParams } from 'next/navigation';
import type { User } from '@struct-pass/shared';
import { UserForm } from '@/features/users';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { DetailPageActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewUserPage() {
  return (
    <FeatureGuard featureId="users" action="view">
      <ViewUserPageBody />
    </FeatureGuard>
  );
}

function ViewUserPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<User>('/users', 'ユーザー');
  const { item: user, loading } = useFetchOne<User>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!user) {
    return <EditPageNotFound message="ユーザーが見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="ユーザー詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/users/${id}`}
          listHref="/dashboard/users"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <UserForm
            mode="view"
            id={id}
            hideActions
            defaultValues={{
              name: user.name,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
