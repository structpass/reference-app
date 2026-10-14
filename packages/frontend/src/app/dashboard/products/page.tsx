'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, Category } from '@struct-pass/shared';
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
import { FeatureGuard } from '@/components/shared/feature-guard';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { usePermissions } from '@/hooks/use-permissions';
import { LOGICAL_FEATURE_IDS } from '@/lib/constants';
import { formatCurrency, formatNumber } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import { Tag } from 'lucide-react';

export default function ProductsPage() {
  return (
    <FeatureGuard featureId="products" action="view">
      <ProductsPageBody />
    </FeatureGuard>
  );
}

function ProductsPageBody() {
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
  } = useListPage<Product>({
    tableId: 'products',
    basePath: '/products',
    entityName: '商品',
  });

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<Product>({
    remove,
    onSuccess: reload,
  });
  const { canCreate, canDelete } = usePermissions();
  const fid = LOGICAL_FEATURE_IDS.PRODUCTS;

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    apiClient
      .get<{ data: Category[] }>('/categories', { params: { limit: 100, status: 'ACTIVE' } })
      .then((res) => setCategories(res.data.data))
      .catch(() => setCategories([]));
  }, []);

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: 'search',
        label: '商品',
        type: 'search',
        placeholder: '商品名・コードで検索...',
        widthClass: 'w-44',
      },
      {
        key: 'categoryId',
        label: 'カテゴリー',
        type: 'select',
        icon: Tag,
        options: categories.map((c) => ({ value: String(c.id), label: c.name })),
      },
    ],
    [categories],
  );

  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      { key: 'code', label: '商品コード', sortable: true, minWidth: 80, defaultWidth: 140 },
      { key: 'name', label: '商品名', sortable: true, minWidth: 100, defaultWidth: 240 },
      {
        key: 'categoryId',
        label: 'カテゴリー',
        sortable: true,
        minWidth: 80,
        defaultWidth: 160,
        render: (item: Product) => (item.category as { name?: string } | undefined)?.name ?? '-',
      },
      {
        key: 'price',
        label: '価格',
        sortable: true,
        className: 'text-right',
        minWidth: 80,
        defaultWidth: 120,
        render: (item: Product) => formatCurrency(item.price),
      },
      {
        key: 'stockQuantity',
        label: '在庫数',
        sortable: true,
        className: 'text-right',
        minWidth: 60,
        defaultWidth: 100,
        render: (item: Product) => formatNumber(item.stockQuantity),
      },
    ],
    [],
  );

  return (
    <PageShell title="商品一覧" featureId="products">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions
        onExport={() => download('/products/export/excel', '商品一覧.xlsx')}
        onNew={() => router.push('/dashboard/products/new')}
        canCreate={canCreate(fid)}
      />

      <DataTableCard<Product>
        tableId="products"
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
        rowHref={(item) => `/dashboard/products/${item.id}`}
        getRowKey={(item) => item.id}
        emptyMessage="商品が見つかりませんでした"
        actions={
          canDelete(fid)
            ? (item) => <DeleteActionButton onDelete={() => setDeleteTarget(item)} />
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="商品を削除"
        targetLabel={`「${deleteTarget?.name ?? ''}」`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
