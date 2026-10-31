import { z } from 'zod';
import { ProductStatus } from '@struct-pass/shared';

export const productSchema = z.object({
  code: z.string().min(1, '商品コードは必須です').max(50, '商品コードは50文字以内です'),
  name: z.string().min(1, '商品名は必須です').max(200, '商品名は200文字以内です'),
  description: z.string().max(1000, '商品説明は1000文字以内です').optional().or(z.literal('')),
  categoryId: z
    .number({
      error: 'カテゴリーを選択してください',
    })
    .int()
    .min(1, 'カテゴリーを選択してください'),
  price: z.number({ error: '価格は数値で入力してください' }).min(0, '価格は0以上です'),
  // 仕入価格は任意。空欄は valueAsNumber により NaN で届くので、未入力として通す。
  // .optional() は undefined しか素通りさせず、NaN は末尾の .or(z.literal('')) にも当たらない
  // （空欄なのに「数値で入力してください」で保存が止まっていた）。z.preprocess の第 1 引数は
  // 親の一部の値ではなく「項目の値そのもの」なので、空欄・未指定は undefined へ寄せ、
  // 数値の検査は通常の .optional() 経路に任せる。空欄でも NaN（数値）が来るので、これで止まらない。
  purchasePrice: z.preprocess(
    (v) => (v === '' || v == null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z
      .number({ error: '仕入価格は数値で入力してください' })
      .min(0, '仕入価格は0以上です')
      .optional(),
  ),
  unit: z.string().max(20, '単位は20文字以内です').optional().or(z.literal('')),
  stockQuantity: z.number().int().min(0).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export type ProductFormData = z.infer<typeof productSchema>;
