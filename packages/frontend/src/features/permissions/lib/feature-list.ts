import {
  isValidObjectTypeKey,
  objectTypePermissionId,
  type FeatureId,
  type ObjectTypePermissionId,
} from '@struct-pass/shared';
import { navCategories, type MatrixCategoryKey } from '@/components/layout/nav-config';

export interface FeatureDefinition {
  id: string;
  name: string;
  category: string;
}

export interface LogicalFeature {
  id: FeatureId | ObjectTypePermissionId;
  name: string;
  category: MatrixCategoryKey;
  crudSupport: {
    view: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
}

/** /object-types の一覧から権限行を作るために必要なcatalog項目。 */
export interface ObjectTypeCatalogFeature {
  key: string;
  name: string;
  sortOrder: number;
  isPreset: boolean;
}

export const FEATURE_CATEGORIES = [
  { key: 'A', label: 'マスタ管理' },
  { key: 'B', label: '入出荷管理' },
  { key: 'C', label: '在庫管理' },
  { key: 'D', label: '発注管理' },
  { key: 'E', label: 'システム管理' },
  { key: 'F', label: '運用管理' },
] as const;

/**
 * featureId 別の CRUD サポート。
 * 'view' のみ true の機能（一覧専用ページ）は閲覧専用フラグとして表示される。
 * 型は `Record<FeatureId, ...>` で TypeScript コンパイル時に網羅が強制される。
 * 新 featureId を `shared/src/feature-ids.ts` に追加する際は本 map にも必ず登録すること
 * （未登録だと tsc が型エラーで落ちる）。
 */
const CRUD_SUPPORT: Record<FeatureId, LogicalFeature['crudSupport']> = {
  products: { view: true, create: true, update: true, delete: true },
  warehouses: { view: true, create: true, update: true, delete: true },
  carriers: { view: true, create: true, update: true, delete: true },
  suppliers: { view: true, create: true, update: true, delete: true },
  categories: { view: true, create: true, update: true, delete: true },
  users: { view: true, create: true, update: true, delete: true },
  groups: { view: true, create: true, update: true, delete: true },
  receivings: { view: true, create: true, update: true, delete: true },
  shipments: { view: true, create: true, update: true, delete: true },
  shipping: { view: true, create: false, update: false, delete: false },
  stocktakings: { view: true, create: true, update: true, delete: true },
  stocks: { view: true, create: false, update: false, delete: false },
  forecast: { view: true, create: false, update: false, delete: false },
  orders: { view: true, create: true, update: true, delete: true },
  permissions: { view: true, create: true, update: true, delete: true },
  'system-parameters': { view: true, create: true, update: true, delete: true },
  // file-import は取込アクション。view = ツールアクセス権 / create = 取込実行権（SEC-H3, 2026-05-29）。
  // 取込（= bulk create/update の書き込み）を create で gate するため matrix にも create カラムを出す。
  // update/delete は取込ツールに概念がないため false（最小権限）。
  'file-import': { view: true, create: true, update: false, delete: false },
  // object-types は台帳管理UIで作成・更新を行う。削除はCustomRecord専用で、台帳定義のdelete APIはない（ref-0099）。
  'object-types': { view: true, create: true, update: true, delete: false },
};

/**
 * sidebar `navCategories` から permission matrix の表示用機能リストを導出する。
 *
 * SSOT 方針:
 * - id / category: nav-config.ts の NavItem.featureId + NavCategory.categoryKey から導出
 * - name: NavItem.label をそのまま使用（表記揺れを sidebar に統一）
 * - crudSupport: 本ファイル内の `CRUD_SUPPORT` map で明示管理
 *
 * 同じ featureId を持つ NavItem が複数ある場合（例: system-parameters は
 * "システム設定" と "一覧ページサイズ" の 2 つ）、最初に出現したものを採用する。
 *
 * categoryKey 未指定のカテゴリは permission matrix の対象外。
 * 現状すべての NavCategory に categoryKey が付与されているため、未対象は存在しない。
 */
export const LOGICAL_FEATURES: LogicalFeature[] = (() => {
  const seen = new Set<string>();
  const result: LogicalFeature[] = [];
  for (const cat of navCategories) {
    if (!cat.categoryKey) continue;
    for (const item of cat.items) {
      const featureId = item.featureId;
      if (!featureId || !(featureId in CRUD_SUPPORT)) continue;
      if (seen.has(featureId)) continue;
      seen.add(featureId);
      result.push({
        id: featureId as FeatureId,
        name: item.label,
        category: cat.categoryKey,
        crudSupport: CRUD_SUPPORT[featureId as FeatureId],
      });
    }
  }
  return result;
})();

/**
 * 静的な機能行へ、現存する非preset ObjectTypeの権限行を追加する。
 *
 * catalogの応答を権限IDとして信頼せず、keyからshared helperで導出する。
 * 不正key、preset、壊れた応答項目は表示・保存対象へ入れない。
 */
export function buildLogicalFeatures(
  objectTypes: readonly ObjectTypeCatalogFeature[],
): LogicalFeature[] {
  const seen = new Set<string>(LOGICAL_FEATURES.map((feature) => feature.id));
  const dynamic = objectTypes
    .filter(
      (objectType) =>
        objectType &&
        typeof objectType.key === 'string' &&
        typeof objectType.name === 'string' &&
        objectType.name.trim().length > 0 &&
        Number.isFinite(objectType.sortOrder) &&
        objectType.isPreset === false &&
        isValidObjectTypeKey(objectType.key),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map((objectType) => ({
      id: objectTypePermissionId(objectType.key),
      name: objectType.name,
      category: 'A' as const,
      crudSupport: { view: true, create: true, update: true, delete: true },
    }))
    .filter((feature) => {
      if (seen.has(feature.id)) return false;
      seen.add(feature.id);
      return true;
    });

  return [...LOGICAL_FEATURES, ...dynamic];
}

// 旧APIとの互換用（24機能ID → 13論理機能）
export const ALL_FEATURES: FeatureDefinition[] = [
  { id: 'Z-1', name: 'ログイン', category: 'Z' },
  { id: 'Z-2', name: 'メニュー', category: 'Z' },
  { id: 'A-1', name: '商品一覧', category: 'A' },
  { id: 'A-2', name: '商品登録', category: 'A' },
  { id: 'A-3', name: '商品編集', category: 'A' },
  { id: 'A-4', name: '倉庫一覧', category: 'A' },
  { id: 'A-5', name: '倉庫登録', category: 'A' },
  { id: 'A-6', name: '倉庫編集', category: 'A' },
  { id: 'A-7', name: '運送会社一覧', category: 'A' },
  { id: 'A-8', name: '運送会社登録', category: 'A' },
  { id: 'A-9', name: '運送会社編集', category: 'A' },
  { id: 'A-10', name: '機能別権限設定', category: 'A' },
  { id: 'A-11', name: 'ユーザー一覧', category: 'A' },
  { id: 'A-12', name: 'ユーザー登録', category: 'A' },
  { id: 'A-13', name: 'グループ一覧', category: 'A' },
  { id: 'A-14', name: 'グループ登録', category: 'A' },
  { id: 'B-1', name: '入荷入力', category: 'B' },
  { id: 'B-2', name: '出荷入力', category: 'B' },
  { id: 'B-3', name: '入出荷一覧', category: 'B' },
  { id: 'C-1', name: '棚卸入力', category: 'C' },
  { id: 'C-2', name: '倉庫別在庫一覧', category: 'C' },
  { id: 'C-3', name: '予測在庫一覧', category: 'C' },
  { id: 'D-1', name: '発注入力', category: 'D' },
];

export function getFeaturesByCategory(categoryKey: string): FeatureDefinition[] {
  return ALL_FEATURES.filter((f) => f.category === categoryKey);
}

export function getLogicalFeaturesByCategory(
  categoryKey: MatrixCategoryKey,
  features: readonly LogicalFeature[] = LOGICAL_FEATURES,
): LogicalFeature[] {
  return features.filter((f) => f.category === categoryKey);
}
