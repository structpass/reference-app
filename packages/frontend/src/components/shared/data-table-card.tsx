'use client';

import type { PaginationMeta, TableId } from '@struct-pass/shared';
import { DataTable, type ColumnDef } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { Spinner } from '@/components/ui/spinner';

interface SortConfig {
  sort: string;
  order: 'asc' | 'desc';
}

interface DataTableCardProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  initialized: boolean;
  loading: boolean;
  meta: PaginationMeta | null;
  onPageChange: (page: number) => void;
  /** 件数セレクタ用の選択肢。useListPage が preference から流す */
  pageSizeOptions?: number[];
  /** 件数セレクタ変更時のコールバック。useListPage の pagination.setLimit を渡す */
  onLimitChange?: (limit: number) => void;
  sortConfig?: SortConfig;
  onSort?: (field: string) => void;
  onRowClick?: (item: T) => void;
  rowHref?: (item: T) => string;
  getRowKey: (item: T) => string | number;
  emptyMessage?: string;
  actions?: (item: T) => React.ReactNode;
  ariaLabel?: string;
  /**
   * thead を paper-2 にするかの切替のみ（旧 v2.1 パイロット由来）。
   * tbody の縞模様・hover 色は rete と揃える統一方針（decision 0015）により
   * `[data-list-compact]` の全体 CSS が常時適用するため、この prop の値によらず縞は出る。
   */
  striped?: boolean;
  /** 列幅永続化を有効化する table 識別子（@struct-pass/shared の TABLE_IDS） */
  tableId?: TableId;
  /**
   * 表ヘッダ・行・resizer の tabIndex を -1 にして tab focus から除外。
   * Struct Pass v2.2 default は true（マウス操作のみで table を扱う運用に合わせる）。
   * sortable や clickable row を tab focus 対象にしたい場合のみ false 指定。
   */
  excludeFromTabOrder?: boolean;
}

/**
 * Struct Pass v2.2 標準テーブルカード。
 * - sp-line-warm 枠 + sp-card 背景
 * - data-list-compact scope：thead 0.75rem / mute 文字 / 列間 separator
 * - 行 hover は DataTable 内の hover 帯スライド（.sp-row-hoverband・rete mdl-0050 追随）
 * - 最小高さ 70vh+2rem（loading 中も layout 安定）
 * - 下部 Pagination（h-8 / 3 グループ中央 grid）
 */
export function DataTableCard<T>({
  data,
  columns,
  initialized,
  loading,
  meta,
  onPageChange,
  pageSizeOptions,
  onLimitChange,
  sortConfig,
  onSort,
  onRowClick,
  rowHref,
  getRowKey,
  emptyMessage,
  actions,
  ariaLabel,
  striped = false,
  tableId,
  excludeFromTabOrder = true,
}: DataTableCardProps<T>) {
  return (
    <div
      data-list-compact
      className="overflow-hidden border border-[var(--sp-line-warm)] bg-[var(--sp-card)]"
    >
      {!initialized ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : (
        <>
          <div className="relative min-h-[calc(70vh+2rem)]">
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            )}
            <DataTable<T>
              data={data}
              columns={columns}
              sortConfig={sortConfig}
              onSort={onSort}
              onRowClick={onRowClick}
              rowHref={rowHref}
              getRowKey={getRowKey}
              emptyMessage={emptyMessage}
              actions={actions}
              ariaLabel={ariaLabel}
              striped={striped}
              tableId={tableId}
              excludeFromTabOrder={excludeFromTabOrder}
            />
          </div>

          {meta && (
            <Pagination
              meta={meta}
              onPageChange={onPageChange}
              pageSizeOptions={pageSizeOptions}
              onLimitChange={onLimitChange}
            />
          )}
        </>
      )}
    </div>
  );
}
