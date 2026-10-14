'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Stocktaking } from '@struct-pass/shared';
import { useListPage } from '@/hooks/use-list-page';
import { useFileDownload } from '@/hooks/use-file-download';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { useSelectOptions } from '@/hooks/use-select-options';
import { type ColumnDef } from '@/components/shared/data-table';
import { type FilterField } from '@/components/shared/filter-bar';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DeleteActionButton } from '@/components/shared/delete-action-button';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Warehouse } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

type StocktakingListItem = Stocktaking & {
  warehouse?: { id: number; name: string; code: string };
};

const columns: ColumnDef<StocktakingListItem>[] = [
  {
    key: 'id',
    label: 'ID',
    sortable: true,
    minWidth: 60,
    defaultWidth: 80,
    render: (item) => `#${item.id}`,
  },
  {
    key: 'stocktakingDate',
    label: '棚卸日',
    sortable: true,
    minWidth: 100,
    defaultWidth: 140,
    render: (item) => formatDate(item.stocktakingDate),
  },
  {
    key: 'warehouseName',
    label: '倉庫',
    minWidth: 100,
    defaultWidth: 220,
    render: (item) => (item.warehouse ? `${item.warehouse.code} - ${item.warehouse.name}` : '-'),
  },
  {
    key: 'stocktaker',
    label: '担当者',
    minWidth: 80,
    defaultWidth: 160,
    render: (item) => item.stocktaker ?? '-',
  },
];

export default function StocktakingsPage() {
  return (
    <FeatureGuard featureId="stocktakings" action="view">
      <StocktakingsPageBody />
    </FeatureGuard>
  );
}

function StocktakingsPageBody() {
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
  } = useListPage<StocktakingListItem>({
    tableId: 'stocktakings',
    basePath: '/stocktakings',
    entityName: '棚卸',
  });
  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<StocktakingListItem>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.STOCKTAKINGS;

  const warehouseMapFn = useCallback(
    (w: { id: number; name: string }) => ({ value: String(w.id), label: w.name }),
    [],
  );
  const { options: warehouseOptions } = useSelectOptions<{ id: number; name: string }>(
    '/warehouses',
    warehouseMapFn,
  );

  const filterFields: FilterField[] = [
    {
      key: 'warehouseId',
      label: '倉庫',
      type: 'select',
      icon: Warehouse,
      options: warehouseOptions,
    },
  ];

  return (
    <PageShell title="棚卸一覧" featureId="stocktakings">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/stocktakings/export', '棚卸一覧.xlsx')}
        onNew={() => router.push('/dashboard/stocktakings/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<StocktakingListItem>
        tableId="stocktakings"
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
        rowHref={(item) => `/dashboard/stocktakings/${item.id}`}
        emptyMessage="棚卸が見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) =>
                item.status === 'DRAFT' ? (
                  <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
                ) : null
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="棚卸を削除"
        targetLabel={`棚卸 #${deleteTarget?.id ?? ''} `}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
