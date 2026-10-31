import { z } from 'zod';

export const categorySchema = z.object({
  code: z.string().min(1, 'コードは必須です').max(20, 'コードは20文字以内で入力してください'),
  name: z.string().min(1, '名前は必須です').max(100, '名前は100文字以内で入力してください'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type CategoryFormData = z.infer<typeof categorySchema>;
