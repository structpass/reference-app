'use client';

import { useParams } from 'next/navigation';
import { ReceivingForm, useReceivingStatusActions } from '@/features/receivings';
import type { ReceivingWithLines } from '@/features/receivings';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import {
  EditPageShell,
  EditPageLoader,
  EditPageNotFound,
} from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
import { LoadFailed } from '@/components/shared/load-failed';
import { DocumentViewActions } from '@/components/shared/detail-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';

export default function ViewReceivingPage() {
  return (
    <FeatureGuard featureId="receivings" action="view">
      <ViewReceivingPageBody />
    </FeatureGuard>
  );
}

function ViewReceivingPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<ReceivingWithLines>('/receivings', '入荷');
  const {
    item: doc,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<ReceivingWithLines>(fetchOne, id);
  const { statusActions, transitioning } = useReceivingStatusActions(doc);

  // 再試行の間はローダーへ戻さない（失敗の表示のその場で処理中を出す・d1039）。
  if (loading && !retrying) {
    return <EditPageLoader />;
  }

  if (loadError || retrying) {
    return (
      <LoadFailed message="記載の情報を読み込めませんでした。" onRetry={reload} busy={retrying} />
    );
  }

  if (!doc) {
    return <EditPageNotFound message="入荷データが見つかりませんでした" />;
  }

  // 伝票系の参照もマスタ系の参照と同じく、導線（編集・状態遷移・戻る）を
  // 画面右上のアクション行へ置く。表の内側に戻るボタンを置かない（d1163）。
  return (
    <EditPageShell
      title="入荷参照"
      compact
      actions={
        <DocumentViewActions
          editHref={doc.status === 'DRAFT' ? `/dashboard/receivings/${doc.id}` : undefined}
          statusActions={statusActions}
          transitioning={transitioning}
        />
      }
    >
      <FormCard>
        <ReceivingForm mode="view" document={doc} hideActions />
      </FormCard>
    </EditPageShell>
  );
}
