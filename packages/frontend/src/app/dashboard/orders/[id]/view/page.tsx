'use client';

import { useParams } from 'next/navigation';
import { OrderForm, useOrderStatusActions } from '@/features/orders';
import type { OrderWithItems } from '@/features/orders';
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

export default function ViewOrderPage() {
  return (
    <FeatureGuard featureId="orders" action="view">
      <ViewOrderPageBody />
    </FeatureGuard>
  );
}

function ViewOrderPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<OrderWithItems>('/orders', '発注');
  const {
    item: doc,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<OrderWithItems>(fetchOne, id);
  const { statusActions, transitioning } = useOrderStatusActions(doc);

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
    return <EditPageNotFound message="発注データが見つかりませんでした" />;
  }

  // 伝票系の参照もマスタ系の参照と同じく、導線（編集・状態遷移・戻る）を
  // 画面右上のアクション行へ置く。表の内側に戻るボタンを置かない（d1163）。
  return (
    <EditPageShell
      title="発注参照"
      compact
      actions={
        <DocumentViewActions
          editHref={doc.status === 'DRAFT' ? `/dashboard/orders/${doc.id}` : undefined}
          statusActions={statusActions}
          transitioning={transitioning}
        />
      }
    >
      <FormCard>
        <OrderForm mode="view" document={doc} hideActions />
      </FormCard>
    </EditPageShell>
  );
}
