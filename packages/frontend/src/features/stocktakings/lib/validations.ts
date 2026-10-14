import { z } from 'zod';

export const stocktakingItemSchema = z.object({
  productId: z.string().min(1, '商品を選択してください'),
  theoreticalQty: z.number().min(0, '0以上を入力してください'),
  actualQty: z.number().min(0, '0以上を入力してください').optional(),
  differenceReason: z.string().max(500).optional(),
});

export const stocktakingSchema = z.object({
  stocktakingDate: z.string().min(1, '棚卸日を入力してください'),
  warehouseId: z.number().min(1, '倉庫を選択してください'),
  stocktaker: z.string().optional(),
  items: z.array(stocktakingItemSchema).min(1, '明細を1行以上入力してください'),
});

export type StocktakingFormData = z.infer<typeof stocktakingSchema>;
export type StocktakingItemData = z.infer<typeof stocktakingItemSchema>;
