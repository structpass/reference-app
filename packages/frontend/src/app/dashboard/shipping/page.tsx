'use client';

import { useCallback } from 'react';
import type { ShippingRecord } from '@struct-pass/shared';
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
import { Warehouse, ArrowLeftRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  RECEIVING: '入荷',
  SHIPMENT: '出荷',
};

const columns: ColumnDef<ShippingRecord>[] = [
  {
    key: 'type',
    label: '種別',
    minWidth: 60,
    defaultWidth: 100,
    render: (item) => (
      <span className={item.type === 'RECEIVING' ? 'text-brand-teal' : 'text-brand-amber'}>
        {item.type === 'RECEIVING' ? '▼ ' : '▲ '}
        {TYPE_LABELS[item.type] ?? item.type}
      </span>
    ),
  },
  { key: 'documentNo', label: '伝票番号', sortable: true, minWidth: 80, defaultWidth: 160 },
  {
    key: 'date',
    label: '日付',
    sortable: true,
    minWidth: 100,
    defaultWidth: 140,
    render: (item) => formatDate(item.date),
  },
  { key: 'warehouseName', label: '倉庫', minWidth: 80, defaultWidth: 160 },
  { key: 'counterparty', label: '取引先', sortable: true, minWidth: 100, defaultWidth: 220 },
];

export default function ShippingListPage() {
  return (
    <FeatureGuard featureId="shipping" action="view">
      <ShippingListPageBody />
    </FeatureGuard>
  );
}

function ShippingListPageBody() {
  const {
    items,
    meta,
    loading,
    initialized,
    pagination,
    pageSizeOptions,
    filters,
    handleFilterChange,
  } = useListPage<ShippingRecord>({
    tableId: 'shipping',
    basePath: '/shipping',
    entityName: '入出荷',
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
      label: '入出荷',
      type: 'search',
      placeholder: '伝票番号・取引先で検索...',
      widthClass: 'w-44',
    },
    {
      key: 'type',
      label: '種別',
      type: 'select',
      icon: ArrowLeftRight,
      options: [
        { value: 'RECEIVING', label: '入荷' },
        { value: 'SHIPMENT', label: '出荷' },
      ],
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
    if (filters.type) params.type = filters.type;
    if (filters.warehouseId) params.warehouseId = filters.warehouseId;
    download('/shipping/export', '入出荷一覧.xlsx', params);
  };

  const getRowHref = (item: ShippingRecord) => {
    if (item.type === 'RECEIVING') return `/dashboard/receivings/${item.id}/view`;
    return `/dashboard/shipments/${item.id}/view`;
  };

  return (
    <PageShell title="入出荷一覧" featureId="shipping">
      <div className="sp-filter-offset mb-2">
        <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
      </div>

      <ListPageActions onExport={handleExport} />

      <DataTableCard<ShippingRecord>
        tableId="shipping"
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
        getRowKey={(item) => `${item.type}-${item.id}`}
        rowHref={getRowHref}
        ariaLabel="入出荷一覧テーブル"
      />
    </PageShell>
  );
}
