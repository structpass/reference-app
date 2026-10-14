import { UserRole } from '@prisma/client';

export interface RolePermissionResponseDto {
  id: number;
  role: UserRole;
  featureId: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}
