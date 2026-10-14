'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Supplier } from '@struct-pass/shared';
import { useListPage } from '@/hooks/use-list-page';
import { useFileDownload } from '@/hooks/use-file-download';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { type ColumnDef } from '@/components/shared/data-table';
import { type FilterField } from '@/components/shared/filter-bar';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DeleteActionButton } from '@/components/shared/delete-action-button';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '仕入先',
    type: 'search',
    placeholder: 'コード・名前で検索...',
    widthClass: 'w-44',
  },
];

export default function SuppliersPage() {
  return (
    <FeatureGuard featureId="suppliers" action="view">
      <SuppliersPageBody />
    </FeatureGuard>
  );
}

function SuppliersPageBody() {
  const router = useRouter();
  const { download } = useFileDownload();
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
  } = useListPage<Supplier>({
    tableId: 'suppliers',
    basePath: '/suppliers',
    entityName: '仕入先',
  });

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Supplier>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.SUPPLIERS;

  const columns: ColumnDef<Supplier>[] = useMemo(
    () => [
      { key: 'code', label: '仕入先コード', sortable: true, minWidth: 80, defaultWidth: 140 },
      { key: 'name', label: '仕入先名', sortable: true, minWidth: 100, defaultWidth: 220 },
      { key: 'contactPerson', label: '担当者', minWidth: 80, defaultWidth: 140 },
      { key: 'email', label: 'メール', minWidth: 100, defaultWidth: 220 },
      { key: 'phone', label: '電話', minWidth: 80, defaultWidth: 140 },
    ],
    [],
  );

  return (
    <PageShell title="仕入先一覧" featureId="suppliers">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/suppliers/export', '仕入先一覧.xlsx')}
        onNew={() => router.push('/dashboard/suppliers/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Supplier>
        tableId="suppliers"
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
        rowHref={(item) => `/dashboard/suppliers/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="仕入先が見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="仕入先を削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
