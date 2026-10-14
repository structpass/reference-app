'use client';

import { useState, useCallback } from 'react';

type RemoveFn = (id: number | string) => Promise<boolean>;

interface UseDeleteConfirmOptions {
  remove: RemoveFn;
  onSuccess?: (deletedId: number | string) => void;
}

/**
 * 一覧画面の削除確認ダイアログ状態と実行ロジックを共通化する。
 *
 * remove() が true を返した場合 onSuccess(deletedId) を呼び、成功/失敗にかかわらず
 * 常にダイアログを閉じる（失敗時のエラー表示は remove 側の toast に委譲）。
 */
export function useDeleteConfirm<T extends { id: number | string }>({
  remove,
  onSuccess,
}: UseDeleteConfirmOptions) {
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const ok = await remove(targetId);
    if (ok) {
      onSuccess?.(targetId);
    }
    setDeleteTarget(null);
  }, [deleteTarget, remove, onSuccess]);

  return {
    deleteTarget,
    setDeleteTarget,
    handleDelete,
  };
}
