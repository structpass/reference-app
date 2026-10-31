import { z } from 'zod';

export const supplierSchema = z.object({
  code: z.string().min(1, 'コードは必須です'),
  name: z.string().min(1, '名前は必須です'),
  address: z.string().optional(),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email('有効なメールアドレスを入力してください').optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type SupplierFormData = z.infer<typeof supplierSchema>;
