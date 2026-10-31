'use client';

import { useRef } from 'react';
import toast from 'react-hot-toast';
import type { AnnouncementAttachmentConfig } from '@struct-pass/shared';
import { Button } from '@/components/ui/button';

interface AttachmentUploaderProps {
  config: AnnouncementAttachmentConfig | null;
  currentCount: number;
  disabled?: boolean;
  uploading?: boolean;
  progress?: number | null;
  onUpload: (file: File) => Promise<boolean>;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}

function validateFile(file: File, config: AnnouncementAttachmentConfig): string | null {
  const ext = getExtension(file.name);
  if (config.allowedExtensions.length > 0 && ext && !config.allowedExtensions.includes(ext)) {
    return `拡張子 .${ext} は許可されていません`;
  }
  const maxBytes = config.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `ファイルサイズが上限(${config.maxSizeMB}MB)を超えています`;
  }
  return null;
}

export function AttachmentUploader({
  config,
  currentCount,
  disabled,
  uploading,
  progress,
  onUpload,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!config) {
    return <p className="text-sm text-[var(--sp-text-warm-mute)]">設定情報を読み込み中...</p>;
  }

  const remaining = config.maxFiles - currentCount;
  const limitReached = remaining <= 0;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (limitReached) {
      toast.error(`添付ファイルは最大${config.maxFiles}件までです`);
      return;
    }
    const file = files[0];
    const err = validateFile(file, config);
    if (err) {
      toast.error(err);
      return;
    }
    await onUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || limitReached || uploading}
      />
      <Button
        type="button"
        variant="sp-action"
        size="sm"
        disabled={disabled || limitReached || uploading}
        onClick={() => inputRef.current?.click()}
      >
        ＋追加
      </Button>
      {uploading && progress != null && (
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-brand-teal transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
