import type { UserRole } from '@prisma/client';
import type { UserSelectPayload, UserWithGroupsPayload } from '../../modules/users/users.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeUserEntity = makeBase<UserSelectPayload>({
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'SYS_ADMIN' as UserRole,
  isActive: true,
  oidcSub: null,
  allowOidcLink: false,
  lastLoginAt: BASE_DATE,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});

export const makeUserWithGroupsEntity = makeBase<UserWithGroupsPayload>({
  ...makeUserEntity(),
  userGroups: [
    {
      userId: 'user-1',
      groupId: 100,
      createdAt: BASE_DATE,
      group: { id: 100, name: '管理者グループ', code: 'G-100' },
    },
  ],
} as unknown as UserWithGroupsPayload);
