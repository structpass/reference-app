import { z } from 'zod';

const orderItemSchema = z.object({
  lineNo: z.number().int().min(1),
  productId: z.string().min(1, '商品は必須です'),
  orderQty: z.number().int().min(1, '発注数量は1以上です'),
  unitPrice: z.number().min(0, '単価は0以上です'),
});

export const orderSchema = z.object({
  orderDate: z.string().min(1, '発注日は必須です'),
  supplierId: z.number().int().min(1, '仕入先は必須です'),
  desiredDeliveryDate: z.string().optional(),
  items: z.array(orderItemSchema).min(1, '明細を1行以上入力してください'),
});

export type OrderFormData = z.infer<typeof orderSchema>;
export type OrderItemData = z.infer<typeof orderItemSchema>;
