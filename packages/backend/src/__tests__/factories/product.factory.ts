import { Prisma } from '@prisma/client';
import type { ProductWithRelations } from '../../modules/products/products.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeProductEntity = makeBase<ProductWithRelations>({
  id: 'p-1',
  code: 'PRD-001',
  name: 'テスト商品',
  description: null,
  categoryId: 1,
  price: new Prisma.Decimal('1234.56'),
  purchasePrice: null,
  unit: null,
  stockQuantity: 10,
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  createdBy: 'user-1',
  updatedBy: null,
  category: { id: 1, code: 'CAT-001', name: '電子機器' },
  creator: { id: 'user-1', name: 'admin' },
  updater: null,
});
