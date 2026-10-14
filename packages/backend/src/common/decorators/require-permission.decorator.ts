import { SetMetadata } from '@nestjs/common';
import type { FeatureId, PermissionAction } from '@struct-pass/shared';

export const REQUIRE_PERMISSION_KEY = 'require-permission';

export interface StaticRequirePermissionMetadata {
  featureId: FeatureId;
  action: PermissionAction;
}

export interface ObjectTypeRequirePermissionMetadata {
  kind: 'object-type';
  keyParam: 'key';
  action: PermissionAction;
}

export type RequirePermissionMetadata =
  | StaticRequirePermissionMetadata
  | ObjectTypeRequirePermissionMetadata;

/**
 * Feature × action 単位で動的権限判定を要求する decorator。
 *
 * DB の `RolePermission` (+ override) を `PermissionGuard` が参照し、
 * frontend `<FeatureGuard>` と同じ semantic で 200 / 403 を切り分ける。
 *
 * SYS_ADMIN は全 feature × 全 action を素通しする (Guard 側で短絡)。
 *
 * 管理系 (permissions / system-parameters) は bootstrap 問題を避けるため
 * 本 decorator ではなく `@RequireRole(SYS_ADMIN)` を使う。
 */
export const RequirePermission = (featureId: FeatureId, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, {
    featureId,
    action,
  } satisfies StaticRequirePermissionMetadata);

/**
 * Require CRUD permission for the ObjectType identified by the route `:key`.
 * The global PermissionGuard resolves preset compatibility and dynamic IDs.
 */
export const RequireObjectTypePermission = (action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, {
    kind: 'object-type',
    keyParam: 'key',
    action,
  } satisfies ObjectTypeRequirePermissionMetadata);
