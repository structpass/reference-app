// 論理 featureId の全体集合（18 件）。FeatureId 型の導出元。
// backend は FeatureId 型のみ import する（FEATURE_IDS 定数の値利用は backend / frontend ともになし）。
// frontend は FeatureId 型を shared から import し、UI 公開サブセット（LOGICAL_FEATURE_IDS）を frontend 側 constants で定義する。
export const FEATURE_IDS = [
  'products',
  'warehouses',
  'carriers',
  'suppliers',
  'categories',
  'users',
  'groups',
  'receivings',
  'shipments',
  'shipping',
  'stocktakings',
  'stocks',
  'forecast',
  'orders',
  'permissions',
  'system-parameters',
  'file-import',
  'object-types',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];
