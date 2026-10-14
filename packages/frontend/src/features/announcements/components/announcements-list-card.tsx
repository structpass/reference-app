'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { AnnouncementListItem } from '@struct-pass/shared';
import { Pagination } from '@/components/shared/pagination';
import { Spinner } from '@/components/ui/spinner';
import { useClientPagination } from '@/hooks/use-client-pagination';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { AnnouncementListItemRow } from './announcement-list-item';

interface AnnouncementsListCardProps {
  items: AnnouncementListItem[];
  selectedId: number | null;
  loading?: boolean;
  canManage?: boolean;
  canReorder?: boolean;
  onSelect: (id: number) => void;
  onDelete?: (item: AnnouncementListItem) => void;
  onReorder?: (nextItems: AnnouncementListItem[]) => void;
  pageSize?: number;
}

export function AnnouncementsListCard({
  items,
  selectedId,
  loading,
  canManage,
  canReorder,
  onSelect,
  onDelete,
  onReorder,
  pageSize = 20,
}: AnnouncementsListCardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // 並び替え可能時はページ分割せず全件表示。
  // 理由: ページ境界を跨いだ並び替えは UX が破綻するため、reorder UI とページネーションは排他にする。
  const reorderActive = !!canReorder && !!onReorder;
  const effectivePageSize = reorderActive ? Math.max(items.length, 1) : pageSize;

  const { pageItems, meta, setPage } = useClientPagination(items, { pageSize: effectivePageSize });

  // 検索フィルタ等で items 配列が変化した際にページを 1 に戻す。
  // useClientPagination は items 変化でも page を維持し、件数が縮んだ時に「掲示板はありません」と誤表示するため。
  const prevLengthRef = useRef(items.length);
  useEffect(() => {
    if (prevLengthRef.current !== items.length) {
      prevLengthRef.current = items.length;
      setPage(1);
    }
  }, [items.length, setPage]);

  const ids = useMemo(() => pageItems.map((it) => it.id), [pageItems]);

  // 明細行 hover 帯（rete mdl-0050 追随）: 行個別の :hover 背景でなく単一の薄グレー帯を
  // スライド追従させる。スクロールコンテナ（下の relative div）が li の offsetParent なので
  // そこへ配線し、帯もその中に描く（スクロールと一緒に動く）。selected 行の
  // bg-[var(--sp-accent-soft)] は現状維持（帯は selected 行にも滑ってよい）。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('li.sp-row-pillable');

  const handleDragEnd = useCallback(
    (evt: DragEndEvent) => {
      const { active, over } = evt;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((it) => it.id === Number(active.id));
      const newIndex = items.findIndex((it) => it.id === Number(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder?.(arrayMove(items, oldIndex, newIndex));
    },
    [items, onReorder],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)]">
      <div className="grid shrink-0 grid-cols-[16px_minmax(0,1fr)_72px_40px_40px_32px] items-center gap-2 border-b border-[var(--sp-line-warm)] bg-[var(--sp-card)] px-2 py-2 text-xs font-normal text-[var(--sp-text-warm-mute)]">
        <span aria-hidden />
        <span>タイトル</span>
        <span>通知日</span>
        <span aria-hidden />
        <span aria-hidden />
        <span aria-hidden />
      </div>

      <div
        ref={listRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <Spinner className="h-6 w-6 text-primary" />
          </div>
        )}
        {items.length === 0 ? (
          <p className="p-4 text-sm text-[var(--sp-text-warm-mute)]">掲示板はありません</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul aria-label="掲示板一覧">
                {pageItems.map((item, index) => (
                  <AnnouncementListItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    selected={item.id === selectedId}
                    onSelect={() => onSelect(item.id)}
                    canManage={canManage}
                    canReorder={canReorder}
                    onDelete={onDelete ? () => onDelete(item) : undefined}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {/* hover 帯は一覧の後（＝行背景より上・.sp-row-pillable の内容より下）に描く装飾専用要素。 */}
        {bandStyle ? (
          <div aria-hidden="true" className="sp-row-hoverband" style={bandStyle} />
        ) : null}
      </div>

      {meta.totalPages > 1 && (
        <div className="shrink-0 border-t border-[var(--sp-line-warm)] bg-[var(--sp-pagination-bg)] px-4">
          <Pagination meta={meta} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
