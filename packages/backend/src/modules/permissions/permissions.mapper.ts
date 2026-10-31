import { RolePermission } from '@prisma/client';
import { RolePermissionResponseDto } from './dto/permission-response.dto';

export function toRolePermissionResponse(entity: RolePermission): RolePermissionResponseDto {
  return {
    id: entity.id,
    role: entity.role,
    featureId: entity.featureId,
    canView: entity.canView,
    canCreate: entity.canCreate,
    canUpdate: entity.canUpdate,
    canDelete: entity.canDelete,
  };
}
