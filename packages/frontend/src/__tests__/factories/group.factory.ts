import { type Group, ActiveStatus, UserRole } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeGroup = makeBase<Group>({
  id: 1,
  code: 'G-001',
  name: 'テストグループ',
  description: 'グループ説明',
  role: UserRole.WH_USER,
  status: ActiveStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
