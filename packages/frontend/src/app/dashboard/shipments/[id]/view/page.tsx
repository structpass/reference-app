'use client';

import { useParams } from 'next/navigation';
import { ShipmentForm, useShipmentStatusActions } from '@/features/shipments';
import type { ShipmentWithLines } from '@/features/shipments';
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

export default function ViewShipmentPage() {
  return (
    <FeatureGuard featureId="shipments" action="view">
      <ViewShipmentPageBody />
    </FeatureGuard>
  );
}

function ViewShipmentPageBody() {
  const { id } = useParams<{ id: string }>();
  const { fetchOne } = useCrudApi<ShipmentWithLines>('/shipments', '出荷');
  const {
    item: doc,
    loading,
    loadError,
    reload,
    retrying,
  } = useFetchOne<ShipmentWithLines>(fetchOne, id);
  const { statusActions, transitioning } = useShipmentStatusActions(doc);

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
    return <EditPageNotFound message="出荷データが見つかりませんでした" />;
  }

  // 伝票系の参照もマスタ系の参照と同じく、導線（編集・状態遷移・戻る）を
  // 画面右上のアクション行へ置く。表の内側に戻るボタンを置かない（d1163）。
  return (
    <EditPageShell
      title="出荷参照"
      compact
      actions={
        <DocumentViewActions
          editHref={doc.status === 'DRAFT' ? `/dashboard/shipments/${doc.id}` : undefined}
          statusActions={statusActions}
          transitioning={transitioning}
        />
      }
    >
      <FormCard>
        <ShipmentForm mode="view" document={doc} hideActions />
      </FormCard>
    </EditPageShell>
  );
}
