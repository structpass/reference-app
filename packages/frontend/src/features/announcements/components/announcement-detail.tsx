'use client';

import { useEffect, useState } from 'react';
import type { AnnouncementResponse } from '@struct-pass/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Pencil } from 'lucide-react';
import { fetchAnnouncement, fetchAnnouncementForManage } from '../lib/api';
import { MarkdownPreview } from './markdown-preview';
import { AttachmentList } from './attachment-list';

interface AnnouncementDetailProps {
  announcementId: number;
  canManage?: boolean;
  onEdit?: () => void;
  refreshKey?: number;
}

function formatDateOnly(isoString: string): string {
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

export function AnnouncementDetail({
  announcementId,
  canManage,
  onEdit,
  refreshKey,
}: AnnouncementDetailProps) {
  const [detail, setDetail] = useState<AnnouncementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const loader = canManage ? fetchAnnouncementForManage : fetchAnnouncement;
    loader(announcementId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [announcementId, canManage, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-[var(--sp-text-warm-mute)]">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (error || !detail) {
    return <p className="p-4 text-sm text-destructive">掲示板の取得に失敗しました</p>;
  }

  return (
    <article className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-xl font-semibold text-[var(--sp-text-warm)]">
            {detail.title}
          </h2>
          {canManage && onEdit && (
            <Button variant="sp-action" size="sm" onClick={onEdit} className="shrink-0">
              <Pencil className="mr-1 h-3.5 w-3.5" />
              編集
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--sp-text-warm-mute)]">
          {formatDateOnly(detail.notifiedAt)}
          {detail.creator?.name && ` ${detail.creator.name}`}
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-base">
            <Checkbox checked={detail.isImportant} disabled />
            <span>重要</span>
          </label>
          <label className="flex items-center gap-2 text-base">
            <Checkbox checked={detail.isNew} disabled />
            <span>New</span>
          </label>
        </div>
        {detail.roles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {detail.roles.map((r) => (
              <span
                key={r.groupId}
                className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-xs text-brand-teal"
              >
                {r.groupName}
              </span>
            ))}
          </div>
        )}
      </header>

      <hr className="border-border" />

      <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <h3 className="text-sm font-semibold text-[var(--sp-text-warm)]">内容</h3>
        {detail.bodyMarkdown.trim().length > 0 ? (
          <MarkdownPreview source={detail.bodyMarkdown} />
        ) : (
          <p className="text-sm text-[var(--sp-text-warm-mute)]">（本文はありません）</p>
        )}
      </section>

      <hr className="border-border" />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--sp-text-warm)]">添付ファイル</h3>
        <AttachmentList announcementId={detail.id} attachments={detail.attachments} />
      </section>
    </article>
  );
}
