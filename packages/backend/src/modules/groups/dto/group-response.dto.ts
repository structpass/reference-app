import { ActiveStatus, UserRole } from '@prisma/client';

export interface GroupResponseDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  role: UserRole;
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberUserDto {
  id: string;
  name: string;
  email: string;
  // SSO 化で role は承認待ち（pending）= null を取りうる。
  role: UserRole | null;
}

export interface GroupMemberResponseDto {
  id: string;
  userId: string;
  groupId: number;
  createdAt: Date;
  user: GroupMemberUserDto;
}

export interface GroupWithMembersResponseDto extends GroupResponseDto {
  userGroups: Array<{ user: GroupMemberUserDto }>;
}
