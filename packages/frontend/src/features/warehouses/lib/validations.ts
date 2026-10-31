import { z } from 'zod';

export const warehouseSchema = z.object({
  code: z.string().min(1, 'コードは必須です'),
  name: z.string().min(1, '名前は必須です'),
  address: z.string().optional(),
  phone: z.string().optional(),
  manager: z.string().optional(),
  capacity: z.number().int().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type WarehouseFormData = z.infer<typeof warehouseSchema>;
