'use client';

import { useRouter } from 'next/navigation';
import type { Receiving } from '@struct-pass/shared';
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
    label: '入荷',
    type: 'search',
    placeholder: '伝票番号・仕入先で検索...',
    widthClass: 'w-44',
  },
];

const columns: ColumnDef<Receiving>[] = [
  { key: 'receivingNo', label: '伝票番号', sortable: true, minWidth: 80, defaultWidth: 160 },
  {
    key: 'receivingDate',
    label: '入荷日',
    sortable: true,
    minWidth: 100,
    defaultWidth: 140,
    render: (item) => formatDate(item.receivingDate),
  },
  {
    key: 'supplier',
    label: '仕入先',
    sortable: true,
    minWidth: 100,
    defaultWidth: 220,
    render: (item) => (item.supplier as { name?: string })?.name ?? '-',
  },
];

export default function ReceivingsPage() {
  return (
    <FeatureGuard featureId="receivings" action="view">
      <ReceivingsPageBody />
    </FeatureGuard>
  );
}

function ReceivingsPageBody() {
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
  } = useListPage<Receiving>({
    tableId: 'receivings',
    basePath: '/receivings',
    entityName: '入荷',
  });
  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Receiving>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.RECEIVINGS;

  return (
    <PageShell title="入荷一覧" featureId="receivings">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/receivings/export', '入荷一覧.xlsx')}
        onNew={() => router.push('/dashboard/receivings/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Receiving>
        tableId="receivings"
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
        rowHref={(item) => `/dashboard/receivings/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="入荷データが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="入荷を削除"
        targetLabel={`「${deleteTarget?.receivingNo ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
