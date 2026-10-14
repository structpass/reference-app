import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ok } from '../../common/dto';
import { PermissionsRepository } from './repositories/permissions.repository';
import { BulkSetRolePermissionsDto } from './dto/set-role-permission.dto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  SYS_ADMIN_ONLY_FEATURES,
  type FeaturePermission,
} from './constants/role-permissions.constants';
import { toRolePermissionResponse } from './permissions.mapper';
import type { PermissionAction } from '@struct-pass/shared';
import {
  isValidObjectTypeKey,
  isObjectTypePermissionId,
  objectTypeKeyFromPermissionId,
  objectTypePermissionId,
} from '@struct-pass/shared';

@Injectable()
export class PermissionsService {
  constructor(private readonly repo: PermissionsRepository) {}

  // ============================================================
  // ロール別権限（新API）
  // ============================================================

  async getAllRolePermissions() {
    const permissions = await this.repo.findAllRolePermissions();
    const canonicalIds = await this.getCanonicalPermissionIds();
    return ok(
      permissions
        .filter((permission) => canonicalIds.has(permission.featureId))
        .map(toRolePermissionResponse),
    );
  }

  async bulkSetRolePermissions(dto: BulkSetRolePermissionsDto) {
    await this.assertCanonicalBulkPermissions(dto.permissions);
    const results = await this.repo.bulkUpsertRolePermissions(dto.permissions);
    return ok(results.map(toRolePermissionResponse));
  }

  // ============================================================
  // 自分の有効権限（ロールベース）
  // ============================================================

  async getMyPermissions(userId: string) {
    const user = await this.repo.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permissionMap = await this.getEffectivePermissionMap(user.role);
    // 全 action が false の feature は response から除外する。
    // 認証済みユーザーが自身の触れない feature を列挙できることを防ぐ（security 3-9）。
    // frontend は entry 不在を fail-closed (false) として扱うため互換性あり。
    const permissions = Array.from(permissionMap.entries())
      .filter(([featureId, perm]) => {
        if (isObjectTypePermissionId(featureId)) return perm.canView;
        return perm.canView || perm.canCreate || perm.canUpdate || perm.canDelete;
      })
      .map(([featureId, perm]) => ({ featureId, ...perm }));

    return ok({ permissions });
  }

  /**
   * Role に対する effective permission を全 feature 分まとめて返す。
   *
   * `PermissionGuard` が request-scoped cache の構築に使う想定で、
   * `getMyPermissions` と同じ解決ロジックを共有する。
   *
   * SYS_ADMIN は DEFAULT_ROLE_PERMISSIONS の全 featureId を全 action 許可で素通し。
   * その他 role は `DEFAULT_ROLE_PERMISSIONS[featureId][role]` を基準に
   * DB `RolePermission` の overlay で **4 フィールド全置換** する。
   * ただし SYS_ADMIN 専用 feature（SYS_ADMIN_ONLY_FEATURES）は overlay の対象外で、
   * DB 行の有無に関わらず既定（NONE）のまま固定する。
   *
   * 重要: DB レコードは canView/canCreate/canUpdate/canDelete を全フィールド明示する前提。
   * `bulkSetRolePermissions` の UI / DTO で全フィールド送出が保証されているため、
   * 「部分上書き」は採用しない（部分上書きを許すと、UI で 1 つ off にしたつもりが他フィールドも
   * default 値で巻き戻る挙動になり、運用上の混乱を招く）。
   */
  async getEffectivePermissionMap(role: UserRole | null): Promise<Map<string, FeaturePermission>> {
    const map = new Map<string, FeaturePermission>();

    // role 未割当（pending / 承認待ち）は権限なし。RolePermission lookup 以前に空 map で返す（spec §4.1）。
    if (!role) {
      return map;
    }

    const objectTypes = await this.repo.findObjectTypesForPermissions();
    const dynamicObjectTypeIds = objectTypes
      .filter((objectType) => !objectType.isPreset && isValidObjectTypeKey(objectType.key))
      .map((objectType) => objectTypePermissionId(objectType.key));

    if (role === UserRole.SYS_ADMIN) {
      for (const featureId of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
        map.set(featureId, {
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        });
      }
      for (const featureId of dynamicObjectTypeIds) {
        map.set(featureId, {
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        });
      }
      return map;
    }

    for (const [featureId, roleDefaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const defaults = roleDefaults[role];
      if (defaults) {
        map.set(featureId, { ...defaults });
      }
    }

    for (const featureId of dynamicObjectTypeIds) {
      map.set(featureId, {
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      });
    }

    const canonicalIds = new Set([
      ...Object.keys(DEFAULT_ROLE_PERMISSIONS),
      ...dynamicObjectTypeIds,
    ]);
    const rolePermissions = await this.repo.findRolePermissionsByRole(role);
    for (const rp of rolePermissions) {
      if (!canonicalIds.has(rp.featureId)) continue;
      // SYS_ADMIN 専用 feature は、DB 行が残っていても非 SYS_ADMIN へは実効化しない。
      // 保存 API は `true` を拒否するが、修正前に書かれた行・直接投入された行が残り得るため、
      // 読み側でも既定（NONE）を上書きさせない（v2-274）。
      if (SYS_ADMIN_ONLY_FEATURES.has(rp.featureId)) continue;
      map.set(rp.featureId, {
        canView: rp.canView,
        canCreate: rp.canCreate,
        canUpdate: rp.canUpdate,
        canDelete: rp.canDelete,
      });
    }

    return map;
  }

  /**
   * Resolve the route-level ObjectType permission while preserving the legacy
   * static object-types permission for preset routes.
   */
  async assertObjectTypePermission(
    role: UserRole | null,
    key: string,
    action: PermissionAction,
    effectiveMap?: Map<string, FeaturePermission>,
  ): Promise<void> {
    if (!isValidObjectTypeKey(key)) {
      throw new BadRequestException('key must be kebab-case and be 100 characters or fewer');
    }

    const objectType = await this.repo.findObjectTypeForPermission(key);
    if (!objectType) {
      throw new NotFoundException('ObjectType not found');
    }

    const map = effectiveMap ?? (await this.getEffectivePermissionMap(role));
    const featureId = objectType.isPreset ? 'object-types' : objectTypePermissionId(key);
    const permission = map.get(featureId);
    const actionField = {
      view: 'canView',
      create: 'canCreate',
      update: 'canUpdate',
      delete: 'canDelete',
    } as const;
    const actionAllowed = permission?.[actionField[action]] === true;
    const viewRequired = !objectType.isPreset && action !== 'view';
    const viewAllowed = !viewRequired || permission?.canView === true;

    if (actionAllowed && viewAllowed) {
      return;
    }

    if (objectType.isPreset) {
      throw new ForbiddenException(`Permission denied: ${featureId}.${action}`);
    }

    // Dynamic ObjectTypes must not be distinguishable from missing ObjectTypes.
    throw new NotFoundException('ObjectType not found');
  }

  private async getCanonicalPermissionIds(): Promise<Set<string>> {
    const ids = new Set(Object.keys(DEFAULT_ROLE_PERMISSIONS));
    const objectTypes = await this.repo.findObjectTypesForPermissions();
    for (const objectType of objectTypes) {
      if (!objectType.isPreset && isValidObjectTypeKey(objectType.key)) {
        ids.add(objectTypePermissionId(objectType.key));
      }
    }
    return ids;
  }

  private async assertCanonicalBulkPermissions(
    permissions: Array<{
      role: UserRole;
      featureId: string;
      canView: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>,
  ): Promise<void> {
    const canonicalIds = await this.getCanonicalPermissionIds();
    const uniqueKeys = new Set<string>();

    for (const permission of permissions) {
      const uniqueKey = `${permission.role}:${permission.featureId}`;
      if (uniqueKeys.has(uniqueKey)) {
        throw new BadRequestException('Duplicate role and featureId in permissions');
      }
      uniqueKeys.add(uniqueKey);

      if (!canonicalIds.has(permission.featureId)) {
        // Keep the parser explicit so malformed dynamic IDs cannot become
        // accidental static feature IDs as the catalog evolves.
        if (objectTypeKeyFromPermissionId(permission.featureId) !== null) {
          throw new BadRequestException('Unknown or preset ObjectType permission');
        }
        throw new BadRequestException('Unknown featureId');
      }

      // SYS_ADMIN 専用 feature は他ロールへ権限を立てられない（固定 OFF）。
      // 権限マトリクス画面は固定 OFF の行も送るため、全 action false の行は従来どおり受理する。
      if (
        permission.role !== UserRole.SYS_ADMIN &&
        SYS_ADMIN_ONLY_FEATURES.has(permission.featureId) &&
        (permission.canView || permission.canCreate || permission.canUpdate || permission.canDelete)
      ) {
        throw new BadRequestException(
          `SYS_ADMIN-only feature cannot be granted to ${permission.role}: ${permission.featureId}`,
        );
      }
    }
  }
}
