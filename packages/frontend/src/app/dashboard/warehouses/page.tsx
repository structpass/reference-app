'use client';

import { useRouter } from 'next/navigation';
import type { Warehouse } from '@struct-pass/shared';
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
import { formatNumber } from '@/lib/utils';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '倉庫',
    type: 'search',
    placeholder: 'コード・名前で検索...',
    widthClass: 'w-44',
  },
];

const columns: ColumnDef<Warehouse>[] = [
  { key: 'code', label: 'コード', sortable: true, minWidth: 80, defaultWidth: 140 },
  { key: 'name', label: '倉庫名', sortable: true, minWidth: 100, defaultWidth: 220 },
  { key: 'address', label: '住所', minWidth: 100, defaultWidth: 240 },
  { key: 'manager', label: '管理者', minWidth: 80, defaultWidth: 140 },
  {
    key: 'capacity',
    label: '容量',
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => (item.capacity != null ? formatNumber(item.capacity) : '-'),
  },
];

export default function WarehousesPage() {
  return (
    <FeatureGuard featureId="warehouses" action="view">
      <WarehousesPageBody />
    </FeatureGuard>
  );
}

function WarehousesPageBody() {
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
  } = useListPage<Warehouse>({
    tableId: 'warehouses',
    basePath: '/warehouses',
    entityName: '倉庫',
  });
  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Warehouse>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.WAREHOUSES;

  return (
    <PageShell title="倉庫一覧" featureId="warehouses">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/warehouses/export', '倉庫一覧.xlsx')}
        onNew={() => router.push('/dashboard/warehouses/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Warehouse>
        tableId="warehouses"
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
        getRowKey={(item) => item.id}
        rowHref={(item) => `/dashboard/warehouses/${item.id}`}
        emptyMessage="倉庫が見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="倉庫を削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
