import { z } from 'zod';

const receivingLineSchema = z.object({
  lineNo: z.number().int().min(1),
  productId: z.string().min(1, '商品は必須です'),
  plannedQty: z.number().int().min(1, '予定数量は1以上です'),
  actualQty: z.number().int().min(0).optional(),
});

export const receivingSchema = z.object({
  receivingDate: z.string().min(1, '入荷日は必須です'),
  warehouseId: z.number().int().min(1, '倉庫は必須です'),
  supplierId: z.number().int().min(1, '仕入先は必須です'),
  lines: z.array(receivingLineSchema).min(1, '明細を1行以上入力してください'),
});

export type ReceivingFormData = z.infer<typeof receivingSchema>;
export type ReceivingLineData = z.infer<typeof receivingLineSchema>;
