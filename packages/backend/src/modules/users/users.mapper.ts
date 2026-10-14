import { Prisma } from '@prisma/client';
import { UserResponseDto, UserWithGroupsResponseDto } from './dto/user-response.dto';

/**
 * USER_SELECT shape（passwordHash / username / mustChangePassword は schema から撤去済み）。
 * oidcSub（rete Account.id = OIDC sub のリンクキー）の生値は公開せず、連携状態（oidcLinked）と
 * 許可フラグ（allowOidcLink）へ加工して payload に載せる（ref-0066・§1 DTO 境界）。
 * 引き当ては where 句（findByOidcSub）で行う。
 */
export type UserSelectPayload = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    email: true;
    role: true;
    isActive: true;
    oidcSub: true;
    allowOidcLink: true;
    lastLoginAt: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

/** USER_SELECT_WITH_GROUPS shape */
export type UserWithGroupsPayload = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    email: true;
    role: true;
    isActive: true;
    oidcSub: true;
    allowOidcLink: true;
    lastLoginAt: true;
    createdAt: true;
    updatedAt: true;
    userGroups: {
      include: { group: { select: { id: true; name: true; code: true } } };
    };
  };
}>;

export function toUserResponse(entity: UserSelectPayload): UserResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    email: entity.email,
    role: entity.role,
    isActive: entity.isActive,
    oidcLinked: entity.oidcSub !== null,
    allowOidcLink: entity.allowOidcLink,
    lastLoginAt: entity.lastLoginAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toUserWithGroupsResponse(entity: UserWithGroupsPayload): UserWithGroupsResponseDto {
  return {
    ...toUserResponse(entity),
    userGroups: entity.userGroups.map((ug) => ({
      group: {
        id: ug.group.id,
        name: ug.group.name,
        code: ug.group.code,
      },
    })),
  };
}
