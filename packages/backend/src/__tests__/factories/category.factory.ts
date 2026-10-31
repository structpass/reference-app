import type { Category } from '@prisma/client';
import { makeBase, BASE_DATE } from './_base';

export const makeCategoryEntity = makeBase<Category>({
  id: 1,
  code: 'CAT-001',
  name: '電子部品',
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});
