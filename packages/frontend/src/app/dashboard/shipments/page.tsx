'use client';

import { useRouter } from 'next/navigation';
import type { Shipment } from '@struct-pass/shared';
import { useListPage } from '@/hooks/use-list-page';
import { useFileDownload } from '@/hooks/use-file-download';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { type FilterField } from '@/components/shared/filter-bar';
import { type ColumnDef } from '@/components/shared/data-table';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DeleteActionButton } from '@/components/shared/delete-action-button';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '出荷',
    type: 'search',
    placeholder: '伝票番号・出荷先で検索...',
    widthClass: 'w-44',
  },
];

const columns: ColumnDef<Shipment>[] = [
  { key: 'shipmentNo', label: '伝票番号', sortable: true, minWidth: 80, defaultWidth: 160 },
  {
    key: 'shipmentDate',
    label: '出荷日',
    sortable: true,
    minWidth: 100,
    defaultWidth: 140,
    render: (item) => formatDate(item.shipmentDate),
  },
  { key: 'destination', label: '出荷先', sortable: true, minWidth: 100, defaultWidth: 220 },
];

export default function ShipmentsPage() {
  return (
    <FeatureGuard featureId="shipments" action="view">
      <ShipmentsPageBody />
    </FeatureGuard>
  );
}

function ShipmentsPageBody() {
  const router = useRouter();
  const {
    items,
    meta,
    loading,
    initialized,
    pagination,
    pageSizeOptions,
    handleFilterChange,
    reload,
    remove,
  } = useListPage<Shipment>({ tableId: 'shipments', basePath: '/shipments', entityName: '出荷' });
  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Shipment>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.SHIPMENTS;

  return (
    <PageShell title="出荷一覧" featureId="shipments">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/shipments/export', '出荷一覧.xlsx')}
        onNew={() => router.push('/dashboard/shipments/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Shipment>
        tableId="shipments"
        data={items}
        columns={columns}
        initialized={initialized}
        loading={loading}
        meta={meta}
        onPageChange={pagination.setPage}
        pageSizeOptions={pageSizeOptions}
        onLimitChange={pagination.setLimit}
        sortConfig={{ sort: pagination.sort, order: pagination.order }}
        onSort={pagination.setSort}
        rowHref={(item) => `/dashboard/shipments/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="出荷データが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="出荷を削除"
        targetLabel={`「${deleteTarget?.shipmentNo ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
