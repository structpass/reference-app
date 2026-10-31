import { Prisma } from '@prisma/client';
import {
  GroupResponseDto,
  GroupMemberResponseDto,
  GroupWithMembersResponseDto,
} from './dto/group-response.dto';

export type GroupPayload = Prisma.GroupGetPayload<Record<string, never>>;

export type GroupWithMembersPayload = Prisma.GroupGetPayload<{
  include: {
    userGroups: {
      include: {
        user: { select: { id: true; name: true; email: true; role: true } };
      };
    };
  };
}>;

export type GroupMemberPayload = Prisma.UserGroupGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; role: true } };
  };
}>;

export function toGroupResponse(entity: GroupPayload): GroupResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description,
    role: entity.role,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toGroupMemberResponse(entity: GroupMemberPayload): GroupMemberResponseDto {
  return {
    id: entity.id,
    userId: entity.userId,
    groupId: entity.groupId,
    createdAt: entity.createdAt,
    user: {
      id: entity.user.id,
      name: entity.user.name,
      email: entity.user.email,
      role: entity.user.role,
    },
  };
}

export function toGroupWithMembersResponse(
  entity: GroupWithMembersPayload,
): GroupWithMembersResponseDto {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description,
    role: entity.role,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    userGroups: entity.userGroups.map((ug) => ({
      user: {
        id: ug.user.id,
        name: ug.user.name,
        email: ug.user.email,
        role: ug.user.role,
      },
    })),
  };
}
