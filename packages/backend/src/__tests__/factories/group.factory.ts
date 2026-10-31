import type {
  GroupPayload,
  GroupMemberPayload,
  GroupWithMembersPayload,
} from '../../modules/groups/groups.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeGroupEntity = makeBase<GroupPayload>({
  id: 1,
  code: 'G-001',
  name: '管理者グループ',
  description: '全権限を持つグループ',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
} as unknown as GroupPayload);

export const makeGroupMemberEntity = makeBase<GroupMemberPayload>({
  id: 'ug-1',
  userId: 'user-1',
  groupId: 1,
  createdAt: BASE_DATE,
  user: {
    id: 'user-1',
    name: 'alice',
    email: 'alice@example.com',
    role: 'ADMIN',
  },
} as unknown as GroupMemberPayload);

export const makeGroupWithMembersEntity = makeBase<GroupWithMembersPayload>({
  ...makeGroupEntity(),
  userGroups: [
    {
      id: 'ug-1',
      userId: 'user-1',
      groupId: 1,
      createdAt: BASE_DATE,
      user: {
        id: 'user-1',
        name: 'alice',
        email: 'alice@example.com',
        role: 'ADMIN',
      },
    },
  ],
} as unknown as GroupWithMembersPayload);
