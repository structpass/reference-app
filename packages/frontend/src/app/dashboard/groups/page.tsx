'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Group } from '@struct-pass/shared';
import type { UserRole } from '@struct-pass/shared';
import { getRoleLabel } from '@/lib/role-utils';
import { type ColumnDef } from '@/components/shared/data-table';
import { type FilterField } from '@/components/shared/filter-bar';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DeleteActionButton } from '@/components/shared/delete-action-button';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { useListPage } from '@/hooks/use-list-page';
import { useFileDownload } from '@/hooks/use-file-download';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '検索',
    type: 'search',
    placeholder: 'コード・名前で検索...',
    widthClass: 'w-44',
  },
];

export default function GroupsPage() {
  return (
    <FeatureGuard featureId="groups" action="view">
      <GroupsPageBody />
    </FeatureGuard>
  );
}

function GroupsPageBody() {
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
  } = useListPage<Group>({
    tableId: 'groups',
    basePath: '/groups',
    entityName: 'グループ',
  });

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Group>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.GROUPS;

  const columns: ColumnDef<Group>[] = useMemo(
    () => [
      { key: 'code', label: 'グループコード', sortable: true, minWidth: 80, defaultWidth: 160 },
      { key: 'name', label: 'グループ名', sortable: true, minWidth: 100, defaultWidth: 200 },
      { key: 'description', label: '説明', minWidth: 100, defaultWidth: 280 },
      {
        key: 'role',
        label: 'ロール',
        minWidth: 100,
        defaultWidth: 160,
        render: (item) => getRoleLabel(item.role as UserRole),
      },
    ],
    [],
  );

  return (
    <PageShell title="グループ一覧" featureId="groups">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/groups/export', 'グループ一覧.xlsx')}
        onNew={() => router.push('/dashboard/groups/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Group>
        tableId="groups"
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
        rowHref={(item) => `/dashboard/groups/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="グループが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="グループを削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
