'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { AnnouncementAttachmentConfig } from '@struct-pass/shared';
import { deleteAttachment, fetchAttachmentConfig, uploadAttachment } from '../lib/api';

export function useAnnouncementAttachmentConfig() {
  const [config, setConfig] = useState<AnnouncementAttachmentConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAttachmentConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setConfig({ maxSizeMB: 20, maxFiles: 4, allowedExtensions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}

export function useAnnouncementAttachments(announcementId: number | null, onChanged: () => void) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (announcementId == null) return false;
      setUploading(true);
      setProgress(0);
      try {
        await uploadAttachment(announcementId, file, (ratio) => setProgress(ratio));
        toast.success('ファイルをアップロードしました');
        onChanged();
        return true;
      } catch {
        toast.error('ファイルのアップロードに失敗しました');
        return false;
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [announcementId, onChanged],
  );

  const remove = useCallback(
    async (attachmentId: number) => {
      if (announcementId == null) return false;
      try {
        await deleteAttachment(announcementId, attachmentId);
        toast.success('添付ファイルを削除しました');
        onChanged();
        return true;
      } catch {
        toast.error('添付ファイルの削除に失敗しました');
        return false;
      }
    },
    [announcementId, onChanged],
  );

  return { uploading, progress, upload, remove };
}
