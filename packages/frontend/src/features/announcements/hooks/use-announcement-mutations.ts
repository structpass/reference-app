'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  type AnnouncementUpsertPayload,
  createAnnouncement,
  deleteAnnouncement,
  reorderAnnouncements,
  updateAnnouncement,
} from '../lib/api';

export function useAnnouncementMutations(onChanged: () => void) {
  const [saving, setSaving] = useState(false);

  const create = useCallback(
    async (payload: AnnouncementUpsertPayload) => {
      setSaving(true);
      try {
        const created = await createAnnouncement(payload);
        toast.success('掲示板を作成しました');
        onChanged();
        return created;
      } catch {
        toast.error('掲示板の作成に失敗しました');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [onChanged],
  );

  const update = useCallback(
    async (id: number, payload: Partial<AnnouncementUpsertPayload>) => {
      setSaving(true);
      try {
        const updated = await updateAnnouncement(id, payload);
        toast.success('掲示板を更新しました');
        onChanged();
        return updated;
      } catch {
        toast.error('掲示板の更新に失敗しました');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [onChanged],
  );

  const remove = useCallback(
    async (id: number | string) => {
      try {
        await deleteAnnouncement(typeof id === 'string' ? Number(id) : id);
        toast.success('掲示板を削除しました');
        onChanged();
        return true;
      } catch {
        toast.error('掲示板の削除に失敗しました');
        return false;
      }
    },
    [onChanged],
  );

  const reorder = useCallback(
    async (items: { id: number; sortOrder: number }[]) => {
      try {
        await reorderAnnouncements(items);
        onChanged();
        return true;
      } catch {
        toast.error('並び順の更新に失敗しました');
        onChanged();
        return false;
      }
    },
    [onChanged],
  );

  return { saving, create, update, remove, reorder };
}
