'use client';

import { ConfirmDialog } from './confirm-dialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  /** 例: '運送会社を削除' */
  title: string;
  /** 削除対象の表示ラベル。例: `「${name}」` / `棚卸 #${id} `（本文は「〜を削除しますか？…」で共通） */
  targetLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}

/** 一覧ページの削除確認ダイアログ（destructive・削除/キャンセル固定）。ref-0042 / invariants §3。 */
export function DeleteConfirmDialog({
  open,
  title,
  targetLabel,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      description={`${targetLabel}を削除しますか？この操作は取り消せません。`}
      confirmLabel="削除"
      onConfirm={onConfirm}
      variant="destructive"
    />
  );
}
