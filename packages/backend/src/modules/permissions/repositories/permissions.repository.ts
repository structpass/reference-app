import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

interface RolePermissionInput {
  role: UserRole;
  featureId: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // RolePermission
  // ============================================================

  findAllRolePermissions() {
    return this.prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { featureId: 'asc' }],
    });
  }

  findRolePermissionsByRole(role: UserRole) {
    return this.prisma.rolePermission.findMany({ where: { role } });
  }

  findObjectTypesForPermissions() {
    return this.prisma.objectType.findMany({
      select: { key: true, isPreset: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findObjectTypeForPermission(key: string) {
    return this.prisma.objectType.findUnique({
      where: { key },
      select: { key: true, isPreset: true },
    });
  }

  bulkUpsertRolePermissions(permissions: RolePermissionInput[]) {
    return this.prisma.$transaction(
      permissions.map((p) =>
        this.prisma.rolePermission.upsert({
          where: { role_featureId: { role: p.role, featureId: p.featureId } },
          update: {
            canView: p.canView,
            canCreate: p.canCreate,
            canUpdate: p.canUpdate,
            canDelete: p.canDelete,
          },
          create: {
            role: p.role,
            featureId: p.featureId,
            canView: p.canView,
            canCreate: p.canCreate,
            canUpdate: p.canUpdate,
            canDelete: p.canDelete,
          },
        }),
      ),
    );
  }

  // ============================================================
  // User existence
  // ============================================================

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
