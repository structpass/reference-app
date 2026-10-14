import { z } from 'zod';

export const groupSchema = z.object({
  code: z.string().min(1, 'コードは必須です'),
  name: z.string().min(1, '名前は必須です'),
  description: z.string().optional(),
  role: z.enum(['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN', 'SYS_ADMIN'], {
    required_error: 'ロールは必須です',
  }),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type GroupFormData = z.infer<typeof groupSchema>;
