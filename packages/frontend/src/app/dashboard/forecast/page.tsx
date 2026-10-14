'use client';

import { useCallback } from 'react';
import type { ForecastStock } from '@struct-pass/shared';
import { useListPage } from '@/hooks/use-list-page';
import { useSelectOptions } from '@/hooks/use-select-options';
import { useFileDownload } from '@/hooks/use-file-download';
import { type FilterField } from '@/components/shared/filter-bar';
import { type ColumnDef } from '@/components/shared/data-table';
import { PageShell } from '@/components/shared/page-shell';
import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableCard } from '@/components/shared/data-table-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ListPageActions } from '@/components/shared/list-page-actions';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { Warehouse } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

const columns: ColumnDef<ForecastStock>[] = [
  {
    key: 'warehouseName',
    label: '倉庫',
    minWidth: 100,
    defaultWidth: 180,
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
    key: 'quantity',
    label: '現在庫',
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => formatNumber(item.quantity),
  },
  {
    key: 'incomingQty',
    label: '入荷予定',
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => (
      <span className="text-info">
        {item.incomingQty > 0 ? `+${formatNumber(item.incomingQty)}` : '0'}
      </span>
    ),
  },
  {
    key: 'outgoingQty',
    label: '出荷予定',
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => (
      <span className="text-warning">
        {item.outgoingQty > 0 ? `-${formatNumber(item.outgoingQty)}` : '0'}
      </span>
    ),
  },
  {
    key: 'forecastQty',
    label: '予測在庫',
    className: 'text-right',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => (
      <span className={item.forecastQty <= 0 ? 'font-semibold text-destructive' : ''}>
        {formatNumber(item.forecastQty)}
      </span>
    ),
  },
  {
    key: 'alert',
    label: 'アラート',
    minWidth: 80,
    defaultWidth: 120,
    render: (item) => <StatusBadge status={item.alert} />,
  },
];

export default function ForecastPage() {
  return (
    // ref-0070: fallbackPath を明示し、権限なしユーザーが自身の forecast ページへ
    // リダイレクトされて白画面に張り付く事象を解消（permissions / system-settings 等の
    // 兄弟ページと同じ /dashboard への fallback）。
    <FeatureGuard featureId="forecast" action="view" fallbackPath="/dashboard">
      <ForecastPageBody />
    </FeatureGuard>
  );
}

function ForecastPageBody() {
  const {
    items,
    meta,
    loading,
    initialized,
    pagination,
    pageSizeOptions,
    filters,
    handleFilterChange,
  } = useListPage<ForecastStock>({
    tableId: 'forecast',
    basePath: '/stocks/forecast',
    entityName: '予測在庫',
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
      label: '予測在庫',
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
    download('/stocks/forecast/export', '予測在庫一覧.xlsx', params);
  };

  return (
    <PageShell title="予測在庫一覧" featureId="forecast">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions onExport={handleExport} />

      <DataTableCard<ForecastStock>
        tableId="forecast"
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
        ariaLabel="予測在庫一覧テーブル"
      />
    </PageShell>
  );
}
