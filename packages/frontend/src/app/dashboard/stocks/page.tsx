'use client';

import { useCallback } from 'react';
import type { StockWithRelations } from '@struct-pass/shared';
import { useListPage } from '@/hooks/use-list-page';
import { useSelectOptions } from '@/hooks/use-select-options';
import { useFileDownload } from '@/hooks/use-file-download';
import { type FilterField } from '@/components/shared/filter-bar';
import { type ColumnDef } from '@/components/shared/data-table';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Warehouse } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

const columns: ColumnDef<StockWithRelations>[] = [
  {
    key: 'warehouseCode',
    label: '倉庫コード',
    minWidth: 80,
    defaultWidth: 140,
    render: (item) => item.warehouse.code,
  },
  {
    key: 'warehouseName',
    label: '倉庫名',
    minWidth: 100,
    defaultWidth: 200,
    render: (item) => item.warehouse.name,
  },
  {
    key: 'productCode',
    label: '商品コード',
    minWidth: 80,
    defaultWidth: 140,
    render: (item) => item.product.code,
  },
  {
    key: 'productName',
    label: '商品名',
    minWidth: 100,
    defaultWidth: 240,
    render: (item) => item.product.name,
  },
  {
    key: 'category',
    label: 'カテゴリー',
    minWidth: 80,
    defaultWidth: 160,
    render: (item) => item.product.category?.name ?? '-',
  },
  {
    key: 'unit',
    label: '単位',
    minWidth: 60,
    defaultWidth: 80,
    render: (item) => item.product.unit ?? '-',
  },
  {
    key: 'quantity',
    label: '在庫数',
    sortable: true,
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => formatNumber(item.quantity),
  },
];

export default function StocksPage() {
  return (
    <FeatureGuard featureId="stocks" action="view">
      <StocksPageBody />
    </FeatureGuard>
  );
}

function StocksPageBody() {
  const {
    items,
    meta,
    loading,
    initialized,
    pagination,
    pageSizeOptions,
    filters,
    handleFilterChange,
  } = useListPage<StockWithRelations>({
    tableId: 'stocks',
    basePath: '/stocks',
    entityName: '在庫',
  });
  const { download } = useFileDownload();

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
      key: 'search',
      label: '在庫',
      type: 'search',
      placeholder: '商品名・コードで検索...',
      widthClass: 'w-44',
    },
    {
      key: 'warehouseId',
      label: '倉庫',
      type: 'select',
      icon: Warehouse,
      options: warehouseOptions,
    },
  ];

  const handleExport = () => {
    const params: Record<string, string> = {};
    if (filters.search) params.search = filters.search;
    if (filters.warehouseId) params.warehouseId = filters.warehouseId;
    if (filters.category) params.category = filters.category;
    download('/stocks/export', '倉庫別在庫一覧.xlsx', params);
  };

  return (
    <PageShell title="倉庫別在庫一覧" featureId="stocks">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions onExport={handleExport} />

      <DataTableCard<StockWithRelations>
        tableId="stocks"
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
      />
    </PageShell>
  );
}
