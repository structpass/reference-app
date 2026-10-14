'use client';

import { useParams } from 'next/navigation';
import type { Group } from '@struct-pass/shared';
import { GroupForm, GroupMembers } from '@/features/groups';
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

export default function ViewGroupPage() {
  return (
    <FeatureGuard featureId="groups" action="view">
      <ViewGroupPageBody />
    </FeatureGuard>
  );
}

function ViewGroupPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<Group>('/groups', 'グループ');
  const { item: group, loading } = useFetchOne<Group>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!group) {
    return <EditPageNotFound message="グループが見つかりませんでした" />;
  }

  return (
    <EditPageShell
      title="グループ詳細"
      compact
      actions={
        <DetailPageActions
          editHref={`/dashboard/groups/${Number(id)}`}
          listHref="/dashboard/groups"
          tabIndex={-1}
        />
      }
    >
      <div data-form-compact>
        <FormCard>
          <GroupForm
            mode="view"
            id={Number(id)}
            hideActions
            defaultValues={{
              code: group.code,
              name: group.name,
              description: group.description || '',
              status: group.status,
            }}
          />
        </FormCard>

        <FormCard className="mt-3">
          {/* v2-462: 閲覧モードは readonly だが、呼び出し元の形を揃えて role を渡す */}
          <GroupMembers groupId={Number(id)} groupRole={group.role} readonly />
        </FormCard>
      </div>
    </EditPageShell>
  );
}
