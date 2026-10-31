import { type Category, ActiveStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeCategory = makeBase<Category>({
  id: 1,
  code: 'C-001',
  name: 'カテゴリーA',
  status: ActiveStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
