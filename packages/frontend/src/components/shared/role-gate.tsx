'use client';

import type { UserRole } from '@struct-pass/shared';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { isAdmin } from '@/lib/role-utils';

interface RoleGateProps {
  allowedRoles?: UserRole[];
  requireAdmin?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowedRoles, requireAdmin, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth();

  if (!user) return null;

  // role 未割当（pending / 承認待ち）は admin でも allowedRoles 一致でもない。
  if (requireAdmin && !isAdmin(user.role)) {
    return <>{fallback}</>;
  }

  if (allowedRoles && (user.role === null || !allowedRoles.includes(user.role))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
