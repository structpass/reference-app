'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { AnnouncementListItem as Item } from '@struct-pass/shared';
import { Button } from '@/components/ui/button';

interface AnnouncementListItemProps {
  item: Item;
  index?: number;
  selected: boolean;
  onSelect: () => void;
  canManage?: boolean;
  canReorder?: boolean;
  onDelete?: () => void;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function AnnouncementListItemRow({
  item,
  index = 0,
  selected,
  onSelect,
  canManage,
  canReorder,
  onDelete,
}: AnnouncementListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canReorder,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        // hover は行個別の静的背景でなく親（AnnouncementsListCard）の hover 帯スライド
        // （.sp-row-hoverband / useRowHoverBand・rete mdl-0050 追随）。.sp-row-pillable が
        // 行内容を帯より前面へ持ち上げる（行背景/罫線は帯の下に沈む）。
        'sp-row-pillable group grid grid-cols-[16px_minmax(0,1fr)_72px_40px_40px_32px] items-center gap-2 border-b border-[var(--sp-line-warm)] px-2 py-2 text-[0.8125rem] text-[var(--sp-text-warm)] transition-colors ' +
        (selected
          ? 'bg-[var(--sp-accent-soft)]'
          : index % 2 === 1
            ? 'bg-[var(--sp-row-stripe)]'
            : 'bg-[var(--sp-card)]')
      }
    >
      {canReorder ? (
        <button
          type="button"
          className="cursor-grab touch-none text-[var(--sp-text-warm-mute)] hover:text-[var(--sp-text-warm)]"
          aria-label="並び替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span aria-hidden />
      )}
      <button type="button" onClick={onSelect} className="min-w-0 truncate text-left font-medium">
        {item.title}
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="text-left text-xs text-[var(--sp-text-warm-mute)]"
      >
        {formatDate(item.notifiedAt)}
      </button>
      <div className="flex justify-center">
        {item.isImportant && (
          <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            重要
          </span>
        )}
      </div>
      <div className="flex justify-center">
        {item.isNew && (
          <span className="rounded bg-brand-amber px-1.5 py-0.5 text-[10px] font-semibold text-white">
            New
          </span>
        )}
      </div>
      <div className="flex justify-end">
        {canManage && onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-[var(--sp-text-warm-mute)] hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="削除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
