import { UserRole } from '@prisma/client';

export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
  // role 未割当（pending / 承認待ち）= null。
  role: UserRole | null;
  isActive: boolean;
  // SSO 連携状態（oidc_sub の有無）。oidc_sub の生値は公開しない（DTO 境界）。
  oidcLinked: boolean;
  // 管理者が SSO 連携を許可した使い切りフラグ（ref-0066・未連携時のみ意味を持つ）。
  allowOidcLink: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGroupDto {
  group: {
    id: number;
    name: string;
    code: string;
  };
}

export interface UserWithGroupsResponseDto extends UserResponseDto {
  userGroups: UserGroupDto[];
}
