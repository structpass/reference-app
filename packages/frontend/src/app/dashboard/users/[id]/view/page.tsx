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
import { LoadFailed } from '@/components/shared/load-failed';
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
  const { item: user, loading, loadError, reload, retrying } = useFetchOne<User>(fetchOne, id);

  // 再試行の間はローダーへ戻さない（失敗の表示のその場で処理中を出す・d1039）。
  if (loading && !retrying) {
    return <EditPageLoader />;
  }

  if (loadError || retrying) {
    return (
      <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={retrying} />
    );
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
              status: user.status,
            }}
          />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
