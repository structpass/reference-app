'use client';

import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

/** 一覧行の削除アイコンボタン。行クリック遷移を止めて削除確認を開く（ref-0042 / invariants §3）。 */
export function DeleteActionButton({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex justify-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="削除"
        className="text-[var(--sp-text-warm-mute)] hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
