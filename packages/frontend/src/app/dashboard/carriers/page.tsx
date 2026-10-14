'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Carrier } from '@struct-pass/shared';
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
    label: '運送会社',
    type: 'search',
    placeholder: 'コード・名前で検索...',
    widthClass: 'w-44',
  },
];

export default function CarriersPage() {
  return (
    <FeatureGuard featureId="carriers" action="view">
      <CarriersPageBody />
    </FeatureGuard>
  );
}

function CarriersPageBody() {
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
  } = useListPage<Carrier>({
    tableId: 'carriers',
    basePath: '/carriers',
    entityName: '運送会社',
  });

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Carrier>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.CARRIERS;

  const columns: ColumnDef<Carrier>[] = useMemo(
    () => [
      { key: 'code', label: '運送会社コード', sortable: true, minWidth: 80, defaultWidth: 140 },
      { key: 'name', label: '運送会社名', sortable: true, minWidth: 100, defaultWidth: 220 },
      { key: 'contactPerson', label: '担当者', minWidth: 80, defaultWidth: 140 },
      { key: 'email', label: 'メール', minWidth: 100, defaultWidth: 220 },
      { key: 'phone', label: '電話', minWidth: 80, defaultWidth: 140 },
    ],
    [],
  );

  return (
    <PageShell title="運送会社一覧" featureId="carriers">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/carriers/export', '運送会社一覧.xlsx')}
        onNew={() => router.push('/dashboard/carriers/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Carrier>
        tableId="carriers"
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
        rowHref={(item) => `/dashboard/carriers/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="運送会社が見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="運送会社を削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
