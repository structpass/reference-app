'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GroupForm } from '@/features/groups';
import type { GroupFormData } from '@/features/groups';
import { useCrudApi } from '@/hooks/use-crud-api';
import type { Group } from '@struct-pass/shared';
import { EditPageShell } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { Button } from '@/components/ui/button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { List, Save } from 'lucide-react';

const FORM_ID = 'group-new-form';

export default function NewGroupPage() {
  return (
    <FeatureGuard featureId="groups" action="create">
      <NewGroupPageBody />
    </FeatureGuard>
  );
}

function NewGroupPageBody() {
  const { create } = useCrudApi<Group>('/groups', 'グループ');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: GroupFormData) => {
    setLoading(true);
    const ok = await create({
      ...data,
      description: data.description || undefined,
    });
    setLoading(false);
    if (ok) {
      router.push('/dashboard/groups');
    }
  };

  return (
    <EditPageShell
      title="グループ登録"
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
            onClick={() => router.push('/dashboard/groups')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            一覧へ戻る
          </Button>
        </>
      }
    >
      <div data-form-compact>
        <FormCard>
          <GroupForm
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
