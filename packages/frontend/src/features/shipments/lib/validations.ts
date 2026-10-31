import { z } from 'zod';

const shipmentLineSchema = z.object({
  lineNo: z.number().int().min(1),
  productId: z.string().min(1, '商品は必須です'),
  plannedQty: z.number().int().min(1, '予定数量は1以上です'),
  actualQty: z.number().int().min(0).optional(),
});

export const shipmentSchema = z.object({
  shipmentDate: z.string().min(1, '出荷日は必須です'),
  warehouseId: z.number().int().min(1, '倉庫は必須です'),
  destination: z.string().min(1, '出荷先は必須です').max(200),
  carrierId: z.number().int().min(1).optional(),
  lines: z.array(shipmentLineSchema).min(1, '明細を1行以上入力してください'),
});

export type ShipmentFormData = z.infer<typeof shipmentSchema>;
export type ShipmentLineData = z.infer<typeof shipmentLineSchema>;
