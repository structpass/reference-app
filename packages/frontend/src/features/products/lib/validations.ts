import { z } from 'zod';
import { ProductStatus } from '@struct-pass/shared';

export const productSchema = z.object({
  code: z.string().min(1, '商品コードは必須です').max(50, '商品コードは50文字以内です'),
  name: z.string().min(1, '商品名は必須です').max(200, '商品名は200文字以内です'),
  description: z.string().max(1000, '商品説明は1000文字以内です').optional().or(z.literal('')),
  categoryId: z
    .number({
      required_error: 'カテゴリーを選択してください',
      invalid_type_error: 'カテゴリーを選択してください',
    })
    .int()
    .min(1, 'カテゴリーを選択してください'),
  price: z.number({ invalid_type_error: '価格は数値で入力してください' }).min(0, '価格は0以上です'),
  purchasePrice: z
    .number({ invalid_type_error: '仕入価格は数値で入力してください' })
    .min(0, '仕入価格は0以上です')
    .optional()
    .or(z.literal('')),
  unit: z.string().max(20, '単位は20文字以内です').optional().or(z.literal('')),
  stockQuantity: z.number().int().min(0).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export type ProductFormData = z.infer<typeof productSchema>;
