export enum UserRole {
  WH_USER = 'WH_USER',
  WH_ADMIN = 'WH_ADMIN',
  OF_USER = 'OF_USER',
  OF_ADMIN = 'OF_ADMIN',
  SYS_ADMIN = 'SYS_ADMIN',
}

export interface User {
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
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
