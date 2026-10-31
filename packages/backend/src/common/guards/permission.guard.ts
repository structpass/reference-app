import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeaturePermission } from '../../modules/permissions/constants/role-permissions.constants';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMetadata,
} from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { PermissionAction } from '@struct-pass/shared';

const PERMS_CACHE_KEY = Symbol.for('struct-pass.permission-guard.cache');

const ACTION_TO_FIELD: Record<PermissionAction, keyof FeaturePermission> = {
  view: 'canView',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
};

/**
 * `@RequirePermission(featureId, action)` を付けた endpoint で、DB Permission Matrix を
 * 参照して 200 / 403 を切り分ける Guard。
 *
 * - metadata が無ければ素通し（permission 要求なし endpoint。class level に
 *   `@UseGuards(PermissionGuard)` を付けても副作用ゼロ）
 * - user が request に乗っていなければ fail-closed（JWT 未認証経路の保険）
 * - 同一リクエスト内で `getEffectivePermissionMap` の結果を `req` に memoize、
 *   N endpoint 経由しても DB hit は 1 回
 * - SYS_ADMIN は service 側で全許可 map を返すので自然に素通し
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() 付き endpoint は JwtAuthGuard で素通しになる結果 req.user が無い。
    // ここで `@RequirePermission` との誤併用を fail-closed させると想定外の 403 になるため、
    // @Public() が宣言されている場合は metadata の有無に関わらず短絡で許可する（defense in depth）。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const meta = this.reflector.getAllAndOverride<RequirePermissionMetadata | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: { role?: string };
      params?: Record<string, string | undefined>;
      [key: symbol]: unknown;
    }>();

    if (!req.user || !req.user.role) {
      throw new ForbiddenException('Permission denied');
    }

    const cached = req[PERMS_CACHE_KEY] as
      | Promise<Map<string, FeaturePermission>>
      | Map<string, FeaturePermission>
      | undefined;

    let mapOrPromise = cached;
    if (!mapOrPromise) {
      mapOrPromise = this.permissions.getEffectivePermissionMap(
        req.user.role as Parameters<PermissionsService['getEffectivePermissionMap']>[0],
      );
      req[PERMS_CACHE_KEY] = mapOrPromise;
    }
    const map = await mapOrPromise;

    if (!('featureId' in meta)) {
      const key = req.params?.[meta.keyParam];
      if (typeof key !== 'string') {
        throw new BadRequestException('ObjectType key is required');
      }
      await this.permissions.assertObjectTypePermission(
        req.user.role as Parameters<PermissionsService['assertObjectTypePermission']>[0],
        key,
        meta.action,
        map,
      );
      return true;
    }

    const perm = map.get(meta.featureId);
    const field = ACTION_TO_FIELD[meta.action];
    if (!perm || perm[field] !== true) {
      throw new ForbiddenException(`Permission denied: ${meta.featureId}.${meta.action}`);
    }

    return true;
  }
}
