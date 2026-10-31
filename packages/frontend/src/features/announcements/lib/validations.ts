import { z } from 'zod';

export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, 'タイトルは必須です').max(200, '200文字以内で入力してください'),
  bodyMarkdown: z.string().max(50000, '50000文字以内で入力してください'),
  isNew: z.boolean(),
  isImportant: z.boolean(),
  notifiedAt: z.string().optional(),
  roleGroupIds: z.array(z.number().int()).default([]),
});

export type AnnouncementFormData = z.infer<typeof announcementFormSchema>;
