import type { ObjectType } from '@prisma/client';
import { makeBase, BASE_DATE } from './_base';

export const makeObjectTypeEntity = makeBase<ObjectType>({
  id: 1,
  key: 'product',
  name: '商品',
  icon: 'package',
  sortOrder: 1,
  isPreset: true,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});
