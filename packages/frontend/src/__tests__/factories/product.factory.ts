import { type Product, ProductStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeProduct = makeBase<Product>({
  id: 'prod-1',
  code: 'P-001',
  name: 'テスト商品',
  description: '商品説明',
  categoryId: 1,
  category: { id: 1, code: 'C-001', name: 'カテゴリーA' },
  price: 1000,
  purchasePrice: 800,
  unit: '個',
  stockQuantity: 50,
  status: ProductStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
  createdBy: 'user-1',
  updatedBy: 'user-1',
});
