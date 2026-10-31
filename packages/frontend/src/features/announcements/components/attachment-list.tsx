'use client';

import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { AnnouncementAttachmentResponse } from '@struct-pass/shared';
import { Button } from '@/components/ui/button';
import { downloadAttachment } from '../lib/api';

interface AttachmentListProps {
  announcementId: number;
  attachments: AnnouncementAttachmentResponse[];
  canDelete?: boolean;
  onDelete?: (attachmentId: number) => void;
  /** 0 件のとき「（添付ファイルなし）」を出す。default: true（参照画面用）。
   *  編集フォームではアップローダが見えていれば自明なので false を渡す。 */
  showEmptyMessage?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({
  announcementId,
  attachments,
  canDelete,
  onDelete,
  showEmptyMessage = true,
}: AttachmentListProps) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  if (attachments.length === 0) {
    if (!showEmptyMessage) return null;
    return <p className="text-sm text-[var(--sp-text-warm-mute)]">（添付ファイルなし）</p>;
  }

  const handleDownload = async (att: AnnouncementAttachmentResponse) => {
    if (downloadingId === att.id) return; // 二重押下抑止
    setDownloadingId(att.id);
    try {
      await downloadAttachment(announcementId, att.id, att.fileName);
    } catch {
      // axios interceptor の global error handler が toast を出す前提。ここでは握りつぶし
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ul className="divide-y divide-border">
      {attachments.map((att) => (
        <li key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{att.fileName}</p>
            <p className="text-xs text-[var(--sp-text-warm-mute)]">{formatSize(att.sizeBytes)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void handleDownload(att)}
              disabled={downloadingId === att.id}
              aria-label="ダウンロード"
            >
              <Download className="h-4 w-4" />
            </Button>
            {canDelete && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--sp-text-warm-mute)] hover:text-destructive"
                onClick={() => onDelete(att.id)}
                aria-label="削除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
