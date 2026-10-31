'use client';

import type { PaginationMeta, TableId } from '@struct-pass/shared';
import { DataTable, type ColumnDef } from '@/components/shared/data-table';
import { LoadFailed } from '@/components/shared/load-failed';
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
  /**
   * 一覧の読み取りに失敗しているか。true の間は空一覧（「見つかりませんでした」）ではなく
   * 失敗の表示と再試行の導線を出す。再試行の動きは onRetry が決める。
   */
  loadError?: boolean;
  /**
   * loadError からの再試行。一覧フックの再取得関数を渡す（同じ引数でも取り直す）。
   * 省くと現在のページを渡し直すだけになるため、1 ページ目の失敗では何も起きない。
   */
  onRetry?: () => void;
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
  /** 空案内の対象名。省略時は「データ」。 */
  emptySubject?: string;
  /**
   * 絞り込みの条件が入っているか（d789）。true の間は 0 件の案内を
   * 「条件に合う物が無い」側の言い方へ切り替える。文言は共通処理が決める。
   */
  filtered?: boolean;
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
  loadError = false,
  onRetry,
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
  emptySubject,
  filtered = false,
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
      ) : loadError ? (
        // 失敗を空一覧と同じ見た目にしない（「データがありません」に落とすと、障害なのか
        // 0 件なのかが分からなくなる）。再取得が成功すれば通常の一覧へ戻る。
        <div className="min-h-[calc(70vh+2rem)]">
          <LoadFailed
            message="一覧の取得に失敗しました。"
            onRetry={onRetry ?? (() => onPageChange(meta?.page ?? 1))}
            busy={loading}
          />
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
              emptySubject={emptySubject}
              filtered={filtered}
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
