'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@struct-pass/shared';
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
import { Badge } from '@/components/ui/badge';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { getRoleLabel } from '@/lib/role-utils';
import { ShieldCheck, ToggleLeft } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';

const filterFields: FilterField[] = [
  {
    key: 'search',
    label: '検索',
    type: 'search',
    placeholder: '名前・メールで検索...',
    widthClass: 'w-44',
  },
  {
    key: 'role',
    label: 'ロール',
    type: 'select',
    icon: ShieldCheck,
    options: [
      { value: 'WH_USER', label: '倉庫担当（一般）' },
      { value: 'WH_ADMIN', label: '倉庫担当（管理者）' },
      { value: 'OF_USER', label: '事務担当（一般）' },
      { value: 'OF_ADMIN', label: '事務担当（管理者）' },
      { value: 'SYS_ADMIN', label: 'システム管理者' },
    ],
  },
  {
    key: 'isActive',
    label: '状態',
    type: 'select',
    icon: ToggleLeft,
    options: [
      { value: 'true', label: '有効' },
      { value: 'false', label: '無効' },
    ],
  },
];

export default function UsersPage() {
  return (
    <FeatureGuard featureId="users" action="view">
      <UsersPageBody />
    </FeatureGuard>
  );
}

function UsersPageBody() {
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
  } = useListPage<User>({
    tableId: 'users',
    basePath: '/users',
    entityName: 'ユーザー',
  });

  const { download } = useFileDownload();
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<User>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.USERS;

  const columns: ColumnDef<User>[] = useMemo(
    () => [
      {
        key: 'name',
        label: '名前',
        sortable: true,
        minWidth: 100,
        defaultWidth: 180,
      },
      {
        key: 'email',
        label: 'メール',
        sortable: true,
        minWidth: 100,
        defaultWidth: 240,
      },
      {
        key: 'role',
        label: 'ロール',
        sortable: true,
        minWidth: 100,
        defaultWidth: 160,
        render: (user) => getRoleLabel(user.role),
      },
      {
        key: 'isActive',
        label: '状態',
        minWidth: 80,
        defaultWidth: 100,
        render: (user) =>
          user.isActive ? (
            <Badge variant="success">有効</Badge>
          ) : (
            <Badge variant="default">無効</Badge>
          ),
      },
    ],
    [],
  );

  return (
    <PageShell title="ユーザー一覧" featureId="users">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/users/export', 'ユーザー一覧.xlsx')}
        onNew={() => router.push('/dashboard/users/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<User>
        tableId="users"
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
        rowHref={(user) => `/dashboard/users/${user.id}`}
        getRowKey={(user) => user.id}
        emptyMessage="ユーザーが見つかりませんでした"
        actions={
          canDelete(fid)
            ? (user) => <DeleteActionButton onDelete={() => setDeleteTarget(user)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="ユーザーを削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
