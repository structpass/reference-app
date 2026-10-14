'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Category } from '@struct-pass/shared';
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
    label: 'カテゴリー',
    type: 'search',
    placeholder: 'コード・名前で検索...',
    widthClass: 'w-44',
  },
];

export default function CategoriesPage() {
  return (
    <FeatureGuard featureId="categories" action="view">
      <CategoriesPageBody />
    </FeatureGuard>
  );
}

function CategoriesPageBody() {
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
  } = useListPage<Category>({
    tableId: 'categories',
    basePath: '/categories',
    entityName: 'カテゴリー',
  });

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Category>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.CATEGORIES;

  const columns: ColumnDef<Category>[] = useMemo(
    () => [
      { key: 'code', label: 'カテゴリーコード', sortable: true, minWidth: 80, defaultWidth: 160 },
      { key: 'name', label: 'カテゴリー名', sortable: true, minWidth: 100, defaultWidth: 240 },
    ],
    [],
  );

  return (
    <PageShell title="カテゴリー一覧" featureId="categories">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/categories/export', 'カテゴリー一覧.xlsx')}
        onNew={() => router.push('/dashboard/categories/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Category>
        tableId="categories"
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
        rowHref={(item) => `/dashboard/categories/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="カテゴリーが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="カテゴリーを削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
