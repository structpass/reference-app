import { UserRole } from '@struct-pass/shared';

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.WH_ADMIN,
  UserRole.OF_ADMIN,
  UserRole.SYS_ADMIN,
]);

export function isAdmin(role: UserRole | null): boolean {
  return role !== null && ADMIN_ROLES.has(role);
}

export function isSysAdmin(role: UserRole | null): boolean {
  return role === UserRole.SYS_ADMIN;
}

export function canDelete(role: UserRole | null): boolean {
  return role !== null && ADMIN_ROLES.has(role);
}

export function canCreateMaster(role: UserRole | null): boolean {
  return role !== null && ADMIN_ROLES.has(role);
}

export function getRoleLabel(role: UserRole | null): string {
  // role 未割当（pending / 承認待ち）。
  if (role === null) return '権限待ち';
  const labels: Record<UserRole, string> = {
    [UserRole.WH_USER]: '倉庫担当（一般）',
    [UserRole.WH_ADMIN]: '倉庫担当（管理者）',
    [UserRole.OF_USER]: '事務担当（一般）',
    [UserRole.OF_ADMIN]: '事務担当（管理者）',
    [UserRole.SYS_ADMIN]: 'システム管理者',
  };
  return labels[role] ?? role;
}
