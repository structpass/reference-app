'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { User } from '@struct-pass/shared';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { UserForm } from '@/features/users';
import type { UserFormSubmitData } from '@/features/users';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const FORM_ID = 'user-edit-form';

export default function EditUserPage() {
  return (
    <FeatureGuard featureId="users" action="update">
      <EditUserPageBody />
    </FeatureGuard>
  );
}

function EditUserPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<User>('/users', 'ユーザー');
  const { item: user, loading, setItem } = useFetchOne<User>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);
  const [allowSsoSubmitting, setAllowSsoSubmitting] = useState(false);
  // v2-426: SSO 連携の許可は SYS_ADMIN のみ（API も同条件で 403 にする）。
  // 許可を立てたメールを名乗る SSO ログインが既存の行へリンクされるため、
  // users:update だけを持つ管理者にはボタンを見せない（押すと必ず失敗する操作を出さない）。
  const { user: caller } = useAuth();
  const canAllowSso = caller?.role === 'SYS_ADMIN';

  const handleSubmit = async (data: UserFormSubmitData) => {
    if (!id) return;
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    };
    const ok = await update(id, payload);
    setSubmitting(false);
    if (ok) {
      // 更新完了トーストを表示し、編集画面に留まる
    }
  };

  // ref-0066: 未連携ユーザーへの SSO 連携許可（使い切りフラグ on）。成功時は表示へ即時反映する。
  const handleAllowSso = async () => {
    if (!id || !user || user.oidcLinked) return;
    setAllowSsoSubmitting(true);
    const ok = await update(id, { allowOidcLink: true });
    setAllowSsoSubmitting(false);
    if (ok) setItem({ ...user, allowOidcLink: true });
  };

  return (
    <EditPageShell
      title="ユーザー編集"
      compact
      actions={
        loading || !user ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/users"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !user ? (
        <EditPageNotFound message="ユーザーが見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">SSO 連携</span>
                  <Badge
                    variant={
                      user.oidcLinked ? 'success' : user.allowOidcLink ? 'warning' : 'secondary'
                    }
                  >
                    {user.oidcLinked ? '連携済み' : user.allowOidcLink ? '許可済み' : '未連携'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {user.oidcLinked
                    ? 'このユーザーは SSO でログインできます。'
                    : user.allowOidcLink
                      ? '許可済みです。次回 SSO ログイン時に自動で連携されます。'
                      : 'このユーザーは SSO でログインできません。ログインを許可する場合は以下のボタンを押してください。'}
                </p>
              </div>
              {!user.oidcLinked && !user.allowOidcLink && canAllowSso && (
                <Button type="button" onClick={handleAllowSso} disabled={allowSsoSubmitting}>
                  SSO 連携を許可
                </Button>
              )}
            </div>
          </FormCard>
          <FormCard>
            <UserForm
              formId={FORM_ID}
              hideActions
              defaultValues={{
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
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
