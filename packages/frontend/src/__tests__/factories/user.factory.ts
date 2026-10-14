import { type User, UserRole } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeUser = makeBase<User>({
  id: 'user-1',
  name: 'tanaka',
  email: 'tanaka@example.com',
  role: UserRole.SYS_ADMIN,
  isActive: true,
  oidcLinked: false,
  allowOidcLink: false,
  lastLoginAt: BASE_DATE_ISO,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
