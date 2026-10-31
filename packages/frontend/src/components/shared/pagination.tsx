'use client';

import type { PaginationMeta } from '@struct-pass/shared';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/utils';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  /** 件数セレクタの選択肢。未指定なら セレクタを表示しない */
  pageSizeOptions?: number[];
  /** 件数セレクタ変更時のコールバック。未指定なら セレクタを表示しない */
  onLimitChange?: (limit: number) => void;
}

const NAV_BTN_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded text-[var(--sp-text-warm-mute)] transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--sp-text-warm-mute)]';

/**
 * Struct Pass v2.2 標準ページネーション帯。
 * 高さ h-8 / grid 3 列 / 中央 = [全件数][ナビ4ボタン][ページ数] gap-6 / 右 = 明細件数 Select。
 * 文字は 0.75rem text-warm-mute 統一。
 */
export function Pagination({
  meta,
  onPageChange,
  pageSizeOptions,
  onLimitChange,
}: PaginationProps) {
  const { page, totalPages, total, limit } = meta;
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  const showSelector = !!onLimitChange && !!pageSizeOptions && pageSizeOptions.length > 0;

  return (
    <div className="grid h-8 flex-shrink-0 grid-cols-3 items-center border-t border-[var(--sp-line-warm)] px-3 text-xs text-[var(--sp-text-warm-2)]">
      <div />
      <div className="flex items-center justify-center gap-6">
        <span className="whitespace-nowrap text-[var(--sp-text-warm-mute)]">
          全 {formatNumber(total)} 件
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className={NAV_BTN_CLASS}
              onClick={() => onPageChange(1)}
              disabled={atFirst}
              aria-label="先頭ページ"
            >
              <ChevronFirst className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={NAV_BTN_CLASS}
              onClick={() => onPageChange(page - 1)}
              disabled={atFirst}
              aria-label="前のページ"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={NAV_BTN_CLASS}
              onClick={() => onPageChange(page + 1)}
              disabled={atLast}
              aria-label="次のページ"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={NAV_BTN_CLASS}
              onClick={() => onPageChange(totalPages)}
              disabled={atLast}
              aria-label="最終ページ"
            >
              <ChevronLast className="h-4 w-4" />
            </button>
          </div>
        )}
        {totalPages > 0 && (
          <span className="whitespace-nowrap text-[var(--sp-text-warm-mute)]">
            {page} / {Math.max(totalPages, 1)} page
          </span>
        )}
      </div>
      <div className="flex items-center justify-end">
        {showSelector && (
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--sp-text-warm-mute)]">明細件数</span>
            <Select value={String(limit)} onValueChange={(v) => onLimitChange?.(Number(v))}>
              <SelectTrigger className="h-6 w-16 border-transparent bg-transparent px-2 text-xs hover:bg-[var(--sp-accent-soft)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions?.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
