'use client';

import { useRouter } from 'next/navigation';
import type { Order } from '@struct-pass/shared';
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
import { formatNumber } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '発注',
    type: 'search',
    placeholder: '伝票番号・仕入先で検索...',
    widthClass: 'w-44',
  },
];

const columns: ColumnDef<Order>[] = [
  { key: 'orderNo', label: '伝票番号', sortable: true, minWidth: 80, defaultWidth: 160 },
  {
    key: 'orderDate',
    label: '発注日',
    sortable: true,
    minWidth: 100,
    defaultWidth: 140,
    render: (item) => formatDate(item.orderDate),
  },
  {
    key: 'supplier',
    label: '仕入先',
    sortable: true,
    minWidth: 100,
    defaultWidth: 220,
    render: (item) => (item.supplier as { name?: string })?.name ?? '-',
  },
  {
    key: 'totalAmount',
    label: '合計金額',
    className: 'text-right',
    minWidth: 80,
    defaultWidth: 140,
    render: (item) => {
      if (item.totalAmount == null) return '-';
      return formatNumber(Number(item.totalAmount));
    },
  },
];

export default function OrdersPage() {
  return (
    <FeatureGuard featureId="orders" action="view">
      <OrdersPageBody />
    </FeatureGuard>
  );
}

function OrdersPageBody() {
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
  } = useListPage<Order>({ tableId: 'orders', basePath: '/orders', entityName: '発注' });
  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Order>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.ORDERS;

  return (
    <PageShell title="発注一覧" featureId="orders">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/orders/export', '発注一覧.xlsx')}
        onNew={() => router.push('/dashboard/orders/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Order>
        tableId="orders"
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
        rowHref={(item) => `/dashboard/orders/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="発注データが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="発注を削除"
        targetLabel={`「${deleteTarget?.orderNo ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
