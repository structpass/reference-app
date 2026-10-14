'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import type { AnnouncementListItem, AnnouncementResponse } from '@struct-pass/shared';
import { extractErrorMessage } from '@/lib/error-utils';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { Button } from '@/components/ui/button';
import { FilterBar, type FilterField } from '@/components/shared/filter-bar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAnnouncements } from '../hooks/use-announcements';
import { useAnnouncementMutations } from '../hooks/use-announcement-mutations';
import { fetchAnnouncementForManage } from '../lib/api';
import type { AnnouncementFormData } from '../lib/validations';
import { AnnouncementsListCard } from './announcements-list-card';
import { AnnouncementDetail } from './announcement-detail';
import { AnnouncementForm } from './announcement-form';

type RightMode = 'view' | 'create' | 'edit';

export function AnnouncementsPanel() {
  // お知らせは SYS_ADMIN 固定運用（権限管理対象外）。
  // 業務発信は Rete のチャット機能で代替する方針（2026-05-11 確定）。
  const { user } = useAuth();
  const isSysAdmin = user?.role === 'SYS_ADMIN';
  const canManage = isSysAdmin;
  const canCreateAnnouncement = isSysAdmin;
  const canUpdateAnnouncement = isSysAdmin;
  const canDeleteAnnouncement = isSysAdmin;

  const mode: 'mine' | 'manage' = canManage ? 'manage' : 'mine';
  const { items, setItems, loading, reload } = useAnnouncements(mode);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightMode, setRightMode] = useState<RightMode>('view');
  const [editingDetail, setEditingDetail] = useState<AnnouncementResponse | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const mutations = useAnnouncementMutations(reload);

  // 検索中は drag-reorder を無効化（フィルタ後の order と元 items の order が一致しないため）
  const isSearching = searchQuery.trim().length > 0;
  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.title.toLowerCase().includes(q) || it.bodyMarkdown.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // 自動選択は items（=真の母集合）に対して行う。検索フィルタで一時的に visibleItems が
  // 縮んでも selectedId は items に存在する限り維持され、検索クリア時の選択ロストを防ぐ
  useEffect(() => {
    if (selectedId == null && items.length > 0) {
      setSelectedId(items[0].id);
    }
    if (selectedId != null && !items.find((it) => it.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: 'q',
        label: '掲示板',
        type: 'search',
        placeholder: 'タイトル・内容で検索...',
        widthClass: 'w-72',
      },
    ],
    [],
  );

  const handleFilterChange = useCallback((filters: Record<string, string | undefined>) => {
    setSearchQuery(filters.q ?? '');
  }, []);

  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<AnnouncementListItem>({
    remove: mutations.remove,
    onSuccess: (deletedId) => {
      if (deletedId === selectedId) {
        setSelectedId(null);
        setRightMode('view');
      }
    },
  });

  const handleCreate = () => {
    setEditingDetail(null);
    setRightMode('create');
  };

  const handleEdit = useCallback(async () => {
    if (selectedId == null) return;
    try {
      const detail = await fetchAnnouncementForManage(selectedId);
      setEditingDetail(detail);
      setRightMode('edit');
    } catch {
      setRightMode('view');
    }
  }, [selectedId]);

  const handleSaveCreate = async (data: AnnouncementFormData) => {
    const created = await mutations.create({
      title: data.title,
      bodyMarkdown: data.bodyMarkdown,
      isNew: data.isNew,
      isImportant: data.isImportant,
      notifiedAt: data.notifiedAt,
      roleGroupIds: data.roleGroupIds,
    });
    if (created) {
      setSelectedId(created.id);
      setRightMode('view');
    }
    return created;
  };

  const handleSaveEdit = async (data: AnnouncementFormData) => {
    if (editingDetail == null) return null;
    const updated = await mutations.update(editingDetail.id, {
      title: data.title,
      bodyMarkdown: data.bodyMarkdown,
      isNew: data.isNew,
      isImportant: data.isImportant,
      notifiedAt: data.notifiedAt,
      roleGroupIds: data.roleGroupIds,
    });
    if (updated) {
      setRightMode('view');
      setDetailRefreshKey((k) => k + 1);
    }
    return updated;
  };

  const handleReorder = useCallback(
    async (next: AnnouncementListItem[]) => {
      // 検索中は reorder を絶対に受け付けない（visibleItems から書き戻すと items 全体が消える）
      if (isSearching) return;
      const prev = items;
      setItems(next);
      const payload = next.map((item, index) => ({ id: item.id, sortOrder: index }));
      const ok = await mutations.reorder(payload);
      if (!ok) {
        setItems(prev);
      }
    },
    [isSearching, items, mutations, setItems],
  );

  const refreshEditingDetail = useCallback(async () => {
    if (editingDetail == null) return;
    try {
      const detail = await fetchAnnouncementForManage(editingDetail.id);
      setEditingDetail(detail);
    } catch (e) {
      toast.error(extractErrorMessage(e, '掲示の最新情報の取得に失敗しました'));
    }
  }, [editingDetail]);

  return (
    <>
      {canManage && (
        <>
          <div className="sp-filter-offset mb-2">
            <FilterBar fields={filterFields} onFilterChange={handleFilterChange} />
          </div>
          {canCreateAnnouncement && (
            <div className="mb-1 flex items-center justify-end gap-1">
              <Button variant="sp-action" size="sp-compact" tabIndex={-1} onClick={handleCreate}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                新規登録
              </Button>
            </div>
          )}
        </>
      )}

      <div
        className={`grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,1fr)_1fr] ${
          canManage ? 'h-[calc(100vh-14rem)]' : 'h-[calc(100vh-9rem)]'
        }`}
      >
        <AnnouncementsListCard
          items={visibleItems}
          selectedId={selectedId}
          loading={loading}
          canManage={canManage}
          canReorder={canManage && !isSearching}
          onSelect={(id) => {
            setSelectedId(id);
            setRightMode('view');
          }}
          onDelete={canDeleteAnnouncement ? (item) => setDeleteTarget(item) : undefined}
          onReorder={handleReorder}
        />

        <section className="flex flex-col overflow-hidden rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)]">
          {rightMode === 'create' ? (
            <div className="overflow-y-auto p-4">
              <AnnouncementForm
                mode="create"
                announcement={null}
                attachments={[]}
                onSave={handleSaveCreate}
                onCancel={() => setRightMode('view')}
                onAttachmentsChanged={() => undefined}
                saving={mutations.saving}
              />
            </div>
          ) : rightMode === 'edit' && editingDetail ? (
            <div className="overflow-y-auto p-4">
              <AnnouncementForm
                mode="edit"
                announcement={editingDetail}
                attachments={editingDetail.attachments}
                onSave={handleSaveEdit}
                onCancel={() => setRightMode('view')}
                onAttachmentsChanged={refreshEditingDetail}
                saving={mutations.saving}
              />
            </div>
          ) : selectedId != null ? (
            <AnnouncementDetail
              announcementId={selectedId}
              canManage={canManage}
              onEdit={canUpdateAnnouncement ? handleEdit : undefined}
              refreshKey={detailRefreshKey}
            />
          ) : (
            <p className="p-4 text-sm text-[var(--sp-text-warm-mute)]">
              左のリストから掲示板を選択してください
            </p>
          )}
        </section>
      </div>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>掲示板を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}
              」を削除します。添付ファイルも併せて削除されます。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
