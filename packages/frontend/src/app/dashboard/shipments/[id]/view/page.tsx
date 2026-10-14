'use client';

import { useParams } from 'next/navigation';
import { ShipmentForm } from '@/features/shipments';
import type { ShipmentWithLines } from '@/features/shipments';
import { useCrudApi } from '@/hooks/use-crud-api';
import { useFetchOne } from '@/hooks/use-fetch-one';
import { PageShell } from '@/components/shared/page-shell';
import { EditPageLoader, EditPageNotFound } from '@/components/shared/edit-page-shell';
import { FormCard } from '@/components/shared/form-card';
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
  const { item: doc, loading } = useFetchOne<ShipmentWithLines>(fetchOne, id);

  if (loading) {
    return <EditPageLoader />;
  }

  if (!doc) {
    return <EditPageNotFound message="出荷データが見つかりませんでした" />;
  }

  // マスタ系 view（EditPageShell + 編集/一覧へ戻るアクションバー）と異なり、
  // トランザクション系 view はアクションバー無しの PageShell を使う。
  // 編集・一覧遷移・ステータス遷移などの導線は伝票フォーム内の DocumentForm が
  // backPath / editPath / statusActions として持つため、シェル側に重複配置しない。
  return (
    <PageShell title="出荷参照">
      <FormCard>
        <ShipmentForm mode="view" document={doc} />
      </FormCard>
    </PageShell>
  );
}
