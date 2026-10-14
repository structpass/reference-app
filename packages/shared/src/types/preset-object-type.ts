import type { FeatureId } from '../feature-ids';

/**
 * Typed master に対応する canonical な ObjectType 投影。
 * 表示名・アイコン・route は各層で重複定義せず、この定義を正本とする。
 */
export interface PresetObjectTypeDefinition {
  readonly key: string;
  readonly featureId: FeatureId;
  readonly route: string;
  readonly name: string;
  readonly icon: string;
  readonly sortOrder: number;
}

export const PRESET_OBJECT_TYPE_DEFINITIONS: readonly PresetObjectTypeDefinition[] = [
  {
    key: 'product',
    featureId: 'products',
    route: '/dashboard/products',
    name: '商品',
    icon: 'package',
    sortOrder: 1,
  },
  {
    key: 'warehouse',
    featureId: 'warehouses',
    route: '/dashboard/warehouses',
    name: '倉庫',
    icon: 'warehouse',
    sortOrder: 2,
  },
  {
    key: 'carrier',
    featureId: 'carriers',
    route: '/dashboard/carriers',
    name: '運送会社',
    icon: 'truck',
    sortOrder: 3,
  },
  {
    key: 'supplier',
    featureId: 'suppliers',
    route: '/dashboard/suppliers',
    name: '仕入先',
    icon: 'building',
    sortOrder: 4,
  },
  {
    key: 'category',
    featureId: 'categories',
    route: '/dashboard/categories',
    name: 'カテゴリー',
    icon: 'tag',
    sortOrder: 5,
  },
] as const;

export interface ObjectTypePresetSource {
  readonly key: string;
  readonly isPreset: boolean;
}

/**
 * DBのObjectType行をcanonical presetへ解決する純粋adapter。
 * 非presetおよび未知keyはprojection対象外とし、dynamic権限を生成しない。
 */
export function projectPresetObjectType(
  objectType: ObjectTypePresetSource,
): PresetObjectTypeDefinition | undefined {
  if (!objectType.isPreset) return undefined;
  return PRESET_OBJECT_TYPE_DEFINITIONS.find((preset) => preset.key === objectType.key);
}
