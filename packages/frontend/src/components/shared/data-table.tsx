'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TableId } from '@struct-pass/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTableColumnWidths } from '@/features/user-table-column-widths';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';

export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (item: T) => React.ReactNode;
  /**
   * 列幅の最小値（px）。tableId が指定された DataTable では各列で必須。
   * resize 時の下限。読み込み時にも `max(savedWidth, minWidth)` で引き上げる。
   */
  minWidth?: number;
  /**
   * 列幅のデフォルト値（px）。永続化された幅が無い場合に使用。
   * 未指定時は minWidth、それも無ければ 120 にフォールバック。
   */
  defaultWidth?: number;
}

interface SortConfig {
  sort: string;
  order: 'asc' | 'desc';
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortConfig?: SortConfig;
  onSort?: (field: string) => void;
  onRowClick?: (item: T) => void;
  rowHref?: (item: T) => string;
  getRowKey: (item: T) => string | number;
  emptyMessage?: string;
  actions?: (item: T) => React.ReactNode;
  /** テーブルのアクセシビリティラベル */
  ariaLabel?: string;
  /**
   * Struct Pass v2.1 パイロット：warm paper テーブル（thead を paper-2 にするかの切替）。
   * tbody 行の縞模様は `[data-list-compact]` の全体 CSS（decision 0015）が `!important` で
   * 常時制御するため、この prop の even クラスは `data-list-compact` 配下
   * （= DataTableCard 経由の全利用箇所）では効かない。行 hover は静的背景でなく
   * hover 帯スライド（.sp-row-hoverband / useRowHoverBand・rete mdl-0050 追随）が担う。
   */
  striped?: boolean;
  /**
   * 列幅永続化を有効化する key。SSOT は @struct-pass/shared の TABLE_IDS。
   * 指定すると table-layout: fixed + resize handle + ユーザー別幅保存が有効になる。
   */
  tableId?: TableId;
  /**
   * true の場合、表ヘッダ（sortable column）・行・列幅 resizer の tabIndex を
   * すべて -1 にして tab focus 巡回から外す。マウス操作のみで table を扱う UI 向け。
   * default false（従来挙動：sortable header / clickable row / resizer は tab focus 対象）。
   */
  excludeFromTabOrder?: boolean;
}

const ACTIONS_COL_WIDTH = 64;
const FALLBACK_WIDTH = 120;
const FALLBACK_MIN_WIDTH = 80;

function SortIcon({ field, sortConfig }: { field: string; sortConfig?: SortConfig }) {
  if (!sortConfig || sortConfig.sort !== field) {
    return <ArrowUpDown className="ml-1 h-3 w-3 text-[var(--sp-text-warm-mute)]" />;
  }
  return sortConfig.order === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  );
}

/** ソート可能なカラムのaria-sort属性値を返す */
function getAriaSortValue(
  field: string,
  sortConfig?: SortConfig,
): 'ascending' | 'descending' | 'none' {
  if (!sortConfig || sortConfig.sort !== field) return 'none';
  return sortConfig.order === 'asc' ? 'ascending' : 'descending';
}

function effectiveMinWidth<T>(col: ColumnDef<T>): number {
  return col.minWidth ?? FALLBACK_MIN_WIDTH;
}

function resolveWidth<T>(
  col: ColumnDef<T>,
  saved: number | undefined,
  draft: number | undefined,
): number {
  const min = effectiveMinWidth(col);
  if (typeof draft === 'number') return Math.max(draft, min);
  if (typeof saved === 'number') return Math.max(saved, min);
  return Math.max(col.defaultWidth ?? min, min) || FALLBACK_WIDTH;
}

export function DataTable<T>({
  data,
  columns,
  sortConfig,
  onSort,
  onRowClick,
  rowHref,
  getRowKey,
  emptyMessage = 'データが見つかりませんでした',
  actions,
  ariaLabel,
  striped = false,
  tableId,
  excludeFromTabOrder = false,
}: DataTableProps<T>) {
  const router = useRouter();
  const resizable = !!tableId;

  // 明細行 hover 帯（rete mdl-0050 追随）: 行個別の :hover 背景でなく単一の薄グレー帯を
  // スライド追従させる。帯はスクロールコンテナ（下の relative div）内の絶対配置要素として
  // 描き、スクロールと一緒に動かす（tr の offsetTop は table 基準・table はコンテナ先頭に
  // 余白なしで接するため offsetTop がそのまま帯の translate になる）。
  // rowSelector は tbody 内の明細 tr のみ（thead 行は tbody 外・空状態は tr 自体が無い）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('tbody tr');

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--sp-text-warm-mute)]" role="status">
        {emptyMessage}
      </div>
    );
  }

  const handleRowClick = (item: T) => {
    if (rowHref) {
      router.push(rowHref(item));
    } else if (onRowClick) {
      onRowClick(item);
    }
  };

  const isClickable = !!rowHref || !!onRowClick;

  return (
    <div
      ref={listRef}
      className="relative max-h-[70vh] overflow-x-auto overflow-y-auto"
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
    >
      {resizable ? (
        <ResizableTable<T>
          tableId={tableId as TableId}
          data={data}
          columns={columns}
          sortConfig={sortConfig}
          onSort={onSort}
          getRowKey={getRowKey}
          actions={actions}
          ariaLabel={ariaLabel}
          striped={striped}
          isClickable={isClickable}
          handleRowClick={handleRowClick}
          excludeFromTabOrder={excludeFromTabOrder}
        />
      ) : (
        <Table className="min-w-[640px]" aria-label={ariaLabel}>
          <TableHeader
            className={cn('sticky top-0 z-10', striped ? 'bg-[var(--sp-paper-2)]' : 'bg-muted/60')}
          >
            <TableRow>
              {columns.map((col) => {
                const isSortable = col.sortable && !!onSort;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      'text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]',
                      isSortable && 'cursor-pointer select-none hover:text-foreground/80',
                      col.className,
                    )}
                    onClick={() => isSortable && onSort?.(col.key)}
                    onKeyDown={(e) => {
                      if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSort?.(col.key);
                      }
                    }}
                    tabIndex={excludeFromTabOrder ? -1 : isSortable ? 0 : undefined}
                    role={isSortable ? 'columnheader' : undefined}
                    aria-sort={isSortable ? getAriaSortValue(col.key, sortConfig) : undefined}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      {isSortable && <SortIcon field={col.key} sortConfig={sortConfig} />}
                    </span>
                  </TableHead>
                );
              })}
              {actions && <TableHead className="w-[64px]" data-no-interact />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow
                key={getRowKey(item)}
                className={cn(
                  'transition-colors',
                  striped
                    ? 'bg-[var(--sp-card)] even:bg-[var(--sp-row-stripe)]'
                    : 'even:bg-muted/20',
                  isClickable && 'cursor-pointer',
                )}
                onClick={() => handleRowClick(item)}
                tabIndex={excludeFromTabOrder ? -1 : isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRowClick(item);
                        }
                      }
                    : undefined
                }
                role={isClickable ? 'link' : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </TableCell>
                ))}
                {actions && (
                  <TableCell
                    className="w-[64px] py-1 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {actions(item)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {/* hover 帯はテーブルの後（＝行背景より上・td 内容より下）に描く装飾専用要素。 */}
      {bandStyle ? <div aria-hidden="true" className="sp-row-hoverband" style={bandStyle} /> : null}
    </div>
  );
}

interface ResizableTableProps<T> {
  tableId: TableId;
  data: T[];
  columns: ColumnDef<T>[];
  sortConfig?: SortConfig;
  onSort?: (field: string) => void;
  getRowKey: (item: T) => string | number;
  actions?: (item: T) => React.ReactNode;
  ariaLabel?: string;
  striped: boolean;
  isClickable: boolean;
  handleRowClick: (item: T) => void;
  excludeFromTabOrder: boolean;
}

/**
 * 列幅永続化対応版テーブル。
 * - table-layout: fixed + colgroup で各列に明示 width
 * - 各 <th> 右端に Resizer。pointer events で drag、window listener で off-cell drag も追従
 * - drag 中は dragWidth をローカル state で保持し、pointerup 時にだけ hook の setWidth を呼ぶ
 * - 文字列セルは truncate + native `title` で省略時 full text を hover で表示
 */
function ResizableTable<T>({
  tableId,
  data,
  columns,
  sortConfig,
  onSort,
  getRowKey,
  actions,
  ariaLabel,
  striped,
  isClickable,
  handleRowClick,
  excludeFromTabOrder,
}: ResizableTableProps<T>) {
  const { widths, setWidth } = useTableColumnWidths(tableId);
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});
  const dragStateRef = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const onPointerDownResizer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, col: ColumnDef<T>) => {
      e.preventDefault();
      e.stopPropagation();
      // setDragWidths の関数型更新で最新値を取り、deps から widths/dragWidths を外す
      setDragWidths((prevDrag) => {
        const startWidth = resolveWidth(col, widths[col.key], prevDrag[col.key]);
        dragStateRef.current = {
          columnKey: col.key,
          startX: e.clientX,
          startWidth,
          minWidth: effectiveMinWidth(col),
        };
        return { ...prevDrag, [col.key]: startWidth };
      });
    },
    // widths は useSyncExternalStore 経由で参照不安定なので closure で都度参照する
    [widths],
  );

  /**
   * キーボード操作で列幅を ±10px ずつ調整（a11y）。
   * Arrow キーで連続変更しても hook 側 debounce が PUT を 1 回に集約する。
   */
  const onKeyDownResizer = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, col: ColumnDef<T>) => {
      const STEP = 10;
      let delta = 0;
      if (e.key === 'ArrowLeft') delta = -STEP;
      else if (e.key === 'ArrowRight') delta = STEP;
      else if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        setWidth(col.key, effectiveMinWidth(col));
        return;
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const current = resolveWidth(col, widths[col.key], dragWidths[col.key]);
      const next = Math.max(effectiveMinWidth(col), current + delta);
      setWidth(col.key, next);
    },
    [widths, dragWidths, setWidth],
  );

  // pointermove / pointerup は window レベルで購読（drag が <th> 外に出ても追従させる）
  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const s = dragStateRef.current;
      if (!s) return;
      const next = Math.max(s.minWidth, Math.round(s.startWidth + (ev.clientX - s.startX)));
      setDragWidths((prev) =>
        prev[s.columnKey] === next ? prev : { ...prev, [s.columnKey]: next },
      );
    }
    function onUp() {
      const s = dragStateRef.current;
      if (!s) return;
      dragStateRef.current = null;
      setDragWidths((prev) => {
        const finalWidth = prev[s.columnKey];
        if (typeof finalWidth === 'number' && finalWidth !== s.startWidth) {
          setWidth(s.columnKey, finalWidth);
        }
        // dragWidth は一時状態。確定後は hook の widths が反映済なので drag state を消す
        const next = { ...prev };
        delete next[s.columnKey];
        return next;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [setWidth]);

  const totalWidth = columns.reduce(
    (sum, col) => sum + resolveWidth(col, widths[col.key], dragWidths[col.key]),
    actions ? ACTIONS_COL_WIDTH : 0,
  );

  return (
    <Table
      className="table-fixed"
      // 列幅合計までは minWidth で死守し、コンテナがそれを超える時は width: 100% で広げる。
      // 末尾の spacer <col>（width 未指定）が table-fixed の規則で余剰幅を一手に吸収するため、
      // 既存列の幅は維持される（Excel 風: 掴んだ列以外の幅は不変）。
      // 横スクロールはラッパ div の overflow-x-auto で担保。
      style={{ width: '100%', minWidth: totalWidth }}
      aria-label={ariaLabel}
    >
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            style={{ width: resolveWidth(col, widths[col.key], dragWidths[col.key]) }}
          />
        ))}
        {actions && <col style={{ width: ACTIONS_COL_WIDTH }} />}
        {/* 余剰幅吸収用 spacer。width 未指定 → table-fixed が remaining を全配分する */}
        <col aria-hidden="true" />
      </colgroup>
      <TableHeader
        className={cn('sticky top-0 z-10', striped ? 'bg-[var(--sp-paper-2)]' : 'bg-muted/60')}
      >
        <TableRow>
          {columns.map((col) => {
            const isSortable = col.sortable && !!onSort;
            return (
              <TableHead
                key={col.key}
                className={cn(
                  'relative text-sm font-semibold uppercase tracking-wide text-[var(--sp-text-warm)]',
                  isSortable && 'cursor-pointer select-none hover:text-foreground/80',
                  col.className,
                )}
                onClick={() => isSortable && onSort?.(col.key)}
                onKeyDown={(e) => {
                  if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSort?.(col.key);
                  }
                }}
                tabIndex={excludeFromTabOrder ? -1 : isSortable ? 0 : undefined}
                role={isSortable ? 'columnheader' : undefined}
                aria-sort={isSortable ? getAriaSortValue(col.key, sortConfig) : undefined}
              >
                <span className="inline-flex items-center truncate">
                  {col.label}
                  {isSortable && <SortIcon field={col.key} sortConfig={sortConfig} />}
                </span>
                <div
                  role="slider"
                  tabIndex={excludeFromTabOrder ? -1 : 0}
                  aria-orientation="vertical"
                  aria-label={`${col.label}列の幅`}
                  aria-valuemin={effectiveMinWidth(col)}
                  aria-valuenow={resolveWidth(col, widths[col.key], dragWidths[col.key])}
                  aria-valuemax={2000}
                  className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none active:bg-accent/60"
                  onPointerDown={(e) => onPointerDownResizer(e, col)}
                  onKeyDown={(e) => onKeyDownResizer(e, col)}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>
            );
          })}
          {actions && <TableHead className="w-[64px]" data-no-interact />}
          {/* spacer 列に対応する空ヘッダ。p-0 でパディング不要 */}
          <TableHead aria-hidden="true" className="p-0" data-no-interact />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow
            key={getRowKey(item)}
            className={cn(
              'transition-colors',
              striped ? 'bg-[var(--sp-card)] even:bg-[var(--sp-row-stripe)]' : 'even:bg-muted/20',
              isClickable && 'cursor-pointer',
            )}
            onClick={() => handleRowClick(item)}
            tabIndex={excludeFromTabOrder ? -1 : isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRowClick(item);
                    }
                  }
                : undefined
            }
            role={isClickable ? 'link' : undefined}
          >
            {columns.map((col) => {
              const raw = (item as Record<string, unknown>)[col.key];
              const rendered = col.render ? col.render(item) : raw == null ? '' : String(raw);
              const titleStr =
                !col.render && raw != null && (typeof raw === 'string' || typeof raw === 'number')
                  ? String(raw)
                  : undefined;
              return (
                <TableCell key={col.key} className={cn('overflow-hidden', col.className)}>
                  <div className={cn('block truncate', col.className)} title={titleStr}>
                    {rendered}
                  </div>
                </TableCell>
              );
            })}
            {actions && (
              <TableCell className="w-[64px] py-1 text-center" onClick={(e) => e.stopPropagation()}>
                {actions(item)}
              </TableCell>
            )}
            {/* spacer 列に対応する空セル。背景はストライプ規則に従う */}
            <TableCell aria-hidden="true" className="p-0" />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
