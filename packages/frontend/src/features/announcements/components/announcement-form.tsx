'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type {
  AnnouncementAttachmentResponse,
  AnnouncementResponse,
  AnnouncementRoleRef,
} from '@struct-pass/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/ui/form-field';
import { Save, X } from 'lucide-react';
import { announcementFormSchema, type AnnouncementFormData } from '../lib/validations';
import { MarkdownTabs } from './markdown-tabs';
import { RolePickerDialog } from './role-picker-dialog';
import { AttachmentUploader } from './attachment-uploader';
import { AttachmentList } from './attachment-list';
import {
  useAnnouncementAttachmentConfig,
  useAnnouncementAttachments,
} from '../hooks/use-announcement-attachments';

interface AnnouncementFormProps {
  mode: 'create' | 'edit';
  announcement?: AnnouncementResponse | null;
  attachments: AnnouncementAttachmentResponse[];
  onSave: (data: AnnouncementFormData) => Promise<AnnouncementResponse | null>;
  onCancel: () => void;
  onAttachmentsChanged: () => void;
  saving: boolean;
}

export function AnnouncementForm({
  mode,
  announcement,
  attachments,
  onSave,
  onCancel,
  onAttachmentsChanged,
  saving,
}: AnnouncementFormProps) {
  const config = useAnnouncementAttachmentConfig();
  const announcementId = announcement?.id ?? null;
  const { uploading, progress, upload, remove } = useAnnouncementAttachments(
    announcementId,
    onAttachmentsChanged,
  );

  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [rolesMeta, setRolesMeta] = useState<AnnouncementRoleRef[]>(announcement?.roles ?? []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: announcement?.title ?? '',
      bodyMarkdown: announcement?.bodyMarkdown ?? '',
      isNew: announcement?.isNew ?? true,
      isImportant: announcement?.isImportant ?? false,
      notifiedAt: announcement?.notifiedAt ?? undefined,
      roleGroupIds: announcement?.roles.map((r) => r.groupId) ?? [],
    },
  });

  useEffect(() => {
    reset({
      title: announcement?.title ?? '',
      bodyMarkdown: announcement?.bodyMarkdown ?? '',
      isNew: announcement?.isNew ?? true,
      isImportant: announcement?.isImportant ?? false,
      notifiedAt: announcement?.notifiedAt ?? undefined,
      roleGroupIds: announcement?.roles.map((r) => r.groupId) ?? [],
    });
    setRolesMeta(announcement?.roles ?? []);
  }, [announcement, reset]);

  const bodyMarkdown = watch('bodyMarkdown');
  const isNew = watch('isNew');
  const isImportant = watch('isImportant');
  const roleGroupIds = watch('roleGroupIds');

  const onSubmit = handleSubmit(async (data) => {
    await onSave(data);
  });

  const handleApplyRoles = (roles: AnnouncementRoleRef[]) => {
    setValue(
      'roleGroupIds',
      roles.map((r) => r.groupId),
      { shouldDirty: true },
    );
    setRolesMeta(roles);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="sp-action" size="sm" onClick={onCancel} disabled={saving}>
          <X className="mr-1 h-4 w-4" />
          キャンセル
        </Button>
        <Button type="submit" variant="sp-action" size="sm" loading={saving} disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {mode === 'create' ? '作成' : '保存'}
        </Button>
      </div>

      <div className="w-full space-y-1.5">
        <Label>
          タイトル
          <span className="ml-1 text-xs text-destructive">*必須</span>
        </Label>
        <Input {...register('title')} disabled={saving} />
        {errors.title?.message && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
        <div className="flex items-center gap-4 pt-1">
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox
              checked={isImportant}
              onCheckedChange={(v) => setValue('isImportant', v, { shouldDirty: true })}
              disabled={saving}
            />
            <span>重要</span>
          </label>
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox
              checked={isNew}
              onCheckedChange={(v) => setValue('isNew', v, { shouldDirty: true })}
              disabled={saving}
            />
            <span>New</span>
          </label>
        </div>
      </div>

      <FormField label="内容" error={errors.bodyMarkdown?.message}>
        <MarkdownTabs
          value={bodyMarkdown}
          onChange={(v) => setValue('bodyMarkdown', v, { shouldDirty: true })}
          disabled={saving}
        />
      </FormField>

      <FormField
        label={
          <>
            表示対象ロール
            <span className="ml-2 text-[10px] font-normal text-[var(--sp-text-warm-mute)]">
              ※未選択時は全ユーザー対象
            </span>
          </>
        }
      >
        <div className="space-y-2">
          {rolesMeta.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {rolesMeta.map((r) => (
                <span
                  key={r.groupId}
                  className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-xs text-brand-teal"
                >
                  {r.groupName}
                </span>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="sp-action"
            size="sm"
            onClick={() => setRolePickerOpen(true)}
            disabled={saving}
          >
            ＋追加
          </Button>
        </div>
      </FormField>

      {mode === 'edit' && announcement && (
        <FormField label="添付ファイル">
          <div className="space-y-3">
            <AttachmentList
              announcementId={announcement.id}
              attachments={attachments}
              canDelete
              onDelete={(attId) => void remove(attId)}
              showEmptyMessage={false}
            />
            <AttachmentUploader
              config={config}
              currentCount={attachments.length}
              uploading={uploading}
              progress={progress}
              disabled={saving}
              onUpload={upload}
            />
          </div>
        </FormField>
      )}

      {mode === 'create' && (
        <p className="rounded border border-border bg-muted/40 p-2 text-xs text-[var(--sp-text-warm-mute)]">
          ファイルは保存後に添付できます。
        </p>
      )}

      <RolePickerDialog
        open={rolePickerOpen}
        onOpenChange={setRolePickerOpen}
        selectedGroupIds={roleGroupIds}
        onApply={handleApplyRoles}
      />
    </form>
  );
}
