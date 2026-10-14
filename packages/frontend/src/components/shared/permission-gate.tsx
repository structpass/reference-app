'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface PermissionGateProps {
  featureId: string;
  action: 'view' | 'create' | 'update' | 'delete';
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  featureId,
  action,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { canView, canCreate, canUpdate, canDelete, loaded, error } = usePermissions();

  if (!loaded) return null;
  if (error) return <>{fallback}</>;

  const checkMap = { view: canView, create: canCreate, update: canUpdate, delete: canDelete };
  const hasPermission = checkMap[action](featureId);

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
