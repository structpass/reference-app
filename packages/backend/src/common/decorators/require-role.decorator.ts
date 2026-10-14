import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'require-role';

/**
 * 指定 role の allowlist で hard-coded に判定する decorator。
 *
 * 用途: bootstrap 問題回避のため、permission matrix に依存させたくない管理系
 * (permissions controller / system-parameters controller) でのみ使う。
 *
 * 業務系 (master / operation) では `@RequirePermission(featureId, action)` を使い、
 * DB Matrix 経由で判定する。
 */
export const RequireRole = (...roles: UserRole[]) => SetMetadata(REQUIRE_ROLE_KEY, roles);
