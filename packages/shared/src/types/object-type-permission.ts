/**
 * User-defined ObjectType permissions use a stable namespace so they cannot
 * collide with the fixed FeatureId catalog.
 */
export const OBJECT_TYPE_PERMISSION_PREFIX = 'object-type:' as const;

/** The canonical ObjectType key syntax shared by API, guard, and permission code. */
export const OBJECT_TYPE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const OBJECT_TYPE_KEY_MAX_LENGTH = 100;

export type ObjectTypePermissionId = `${typeof OBJECT_TYPE_PERMISSION_PREFIX}${string}`;

export function isValidObjectTypeKey(key: string): boolean {
  return (
    key.length > 0 && key.length <= OBJECT_TYPE_KEY_MAX_LENGTH && OBJECT_TYPE_KEY_PATTERN.test(key)
  );
}

export function objectTypePermissionId(key: string): ObjectTypePermissionId {
  return `${OBJECT_TYPE_PERMISSION_PREFIX}${key}`;
}

export function objectTypeKeyFromPermissionId(featureId: string): string | null {
  if (!featureId.startsWith(OBJECT_TYPE_PERMISSION_PREFIX)) {
    return null;
  }

  const key = featureId.slice(OBJECT_TYPE_PERMISSION_PREFIX.length);
  return isValidObjectTypeKey(key) ? key : null;
}

export function isObjectTypePermissionId(featureId: string): featureId is ObjectTypePermissionId {
  return objectTypeKeyFromPermissionId(featureId) !== null;
}
