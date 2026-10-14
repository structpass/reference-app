'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { Group } from '@struct-pass/shared';
import { GroupForm, GroupMembers } from '@/features/groups';
import type { GroupFormData } from '@/features/groups';
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

const FORM_ID = 'group-edit-form';

export default function EditGroupPage() {
  return (
    <FeatureGuard featureId="groups" action="update">
      <EditGroupPageBody />
    </FeatureGuard>
  );
}

function EditGroupPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne, update } = useCrudApi<Group>('/groups', 'グループ');
  const { item: group, loading } = useFetchOne<Group>(fetchOne, id);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: GroupFormData) => {
    if (!id) return;
    setSubmitting(true);
    const ok = await update(Number(id), {
      ...data,
      description: data.description || undefined,
    });
    setSubmitting(false);
    if (ok) {
      // 更新完了トーストを表示し、編集画面に留まる
    }
  };

  return (
    <EditPageShell
      title="グループ編集"
      compact
      actions={
        loading || !group ? null : (
          <EditPageActions
            formId={FORM_ID}
            submitLabel="マスタ更新"
            submitting={submitting}
            listHref="/dashboard/groups"
            tabIndex={-1}
          />
        )
      }
    >
      {loading ? (
        <EditPageLoader />
      ) : !group ? (
        <EditPageNotFound message="グループが見つかりませんでした" />
      ) : (
        <div data-form-compact>
          <FormCard>
            <GroupForm
              formId={FORM_ID}
              hideActions
              defaultValues={{
                code: group.code,
                name: group.name,
                description: group.description || '',
                // v2-427: 現在の role を渡さないとロール選択が未選択のまま表示され、保存時に
                // role が欠落する。現在値を選択肢に残す判定にも使う。
                role: group.role,
                status: group.status,
              }}
              onSubmit={handleSubmit}
              mode="edit"
              loading={submitting}
            />
          </FormCard>

          <FormCard className="mt-3">
            {/* v2-462: 系統違いのグループでは追加候補と追加 UI を出さないため、グループの role を渡す */}
            <GroupMembers groupId={Number(id)} groupRole={group.role} />
          </FormCard>
        </div>
      )}
    </EditPageShell>
  );
}
