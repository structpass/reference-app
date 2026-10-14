import {
  Users,
  UserCog,
  Shield,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ClipboardCheck,
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Settings,
  Sliders,
  TableProperties,
  Upload,
} from 'lucide-react';
import {
  PRESET_OBJECT_TYPE_DEFINITIONS,
  isObjectTypePermissionId,
  type FeatureId,
  type ObjectTypePermissionId,
  type PresetObjectTypeDefinition,
} from '@struct-pass/shared';
import { resolveLedgerIcon } from '@/features/custom-ledger/lib/icons';

/**
 * Sidebar が参照する nav 設定 SSOT。
 */
export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  featureId?: FeatureId | ObjectTypePermissionId;
  /** canonical ObjectType presetとの対応を識別する安定キー */
  presetKey?: PresetObjectTypeDefinition['key'];
  /** catalog metadataを反映した表示順。非presetの既存nav itemは未設定。 */
  sortOrder?: number;
}

/**
 * permission matrix のカテゴリキー。matrix 側の `FEATURE_CATEGORIES` と一致させる SSOT。
 * 'A': マスタ管理 / 'B': 入出荷管理 / 'C': 在庫管理 / 'D': 発注管理 / 'E': システム管理 / 'F': 運用管理
 */
export type MatrixCategoryKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface NavCategory {
  label: string;
  items: NavItem[];
  categoryKey?: MatrixCategoryKey;
}

/** Sidebarが表示へ投影するObjectType catalogの最小契約。 */
export interface PresetCatalogItem {
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isPreset: boolean;
}

/**
 * canonical定義をNavItemへ投影する。
 * catalogに行がない場合はcanonicalの表示metadataを使い、既知行がある場合だけ
 * name/icon/sortOrderを上書きする。href/featureId/presetKeyは常にcanonicalから解決する。
 */
export function buildPresetNavItems(catalog: readonly PresetCatalogItem[]): NavItem[] {
  return PRESET_OBJECT_TYPE_DEFINITIONS.map((preset) => {
    const source = catalog.find((item) => item.isPreset === true && item.key === preset.key);
    const label = source?.name.trim() ? source.name : preset.name;
    const icon = resolveLedgerIcon(source ? source.icon : preset.icon);
    const sortOrder =
      source && Number.isFinite(source.sortOrder) ? source.sortOrder : preset.sortOrder;
    return {
      href: preset.route,
      label,
      icon,
      featureId: preset.featureId,
      presetKey: preset.key,
      sortOrder,
    };
  }).sort((a, b) => {
    const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (order !== 0) return order;
    return (
      PRESET_OBJECT_TYPE_DEFINITIONS.findIndex((preset) => preset.key === a.presetKey) -
      PRESET_OBJECT_TYPE_DEFINITIONS.findIndex((preset) => preset.key === b.presetKey)
    );
  });
}

const CANONICAL_PRESET_NAV_ITEMS = buildPresetNavItems([]);

export const navCategories: NavCategory[] = [
  {
    label: '運用管理',
    categoryKey: 'F',
    items: [
      {
        href: '/dashboard/imports',
        label: 'ファイル取込',
        icon: Upload,
        featureId: 'file-import',
      },
    ],
  },
  {
    label: 'マスタ管理',
    categoryKey: 'A',
    items: [
      ...CANONICAL_PRESET_NAV_ITEMS,
      { href: '/dashboard/users', label: 'ユーザー', icon: Users, featureId: 'users' },
      { href: '/dashboard/groups', label: 'グループ', icon: UserCog, featureId: 'groups' },
    ],
  },
  {
    label: '入出荷管理',
    categoryKey: 'B',
    items: [
      {
        href: '/dashboard/receivings',
        label: '入荷入力',
        icon: ArrowDownToLine,
        featureId: 'receivings',
      },
      {
        href: '/dashboard/shipments',
        label: '出荷入力',
        icon: ArrowUpFromLine,
        featureId: 'shipments',
      },
      {
        href: '/dashboard/shipping',
        label: '入出荷一覧',
        icon: ArrowLeftRight,
        featureId: 'shipping',
      },
    ],
  },
  {
    label: '在庫管理',
    categoryKey: 'C',
    items: [
      {
        href: '/dashboard/stocktakings',
        label: '棚卸入力',
        icon: ClipboardCheck,
        featureId: 'stocktakings',
      },
      { href: '/dashboard/stocks', label: '倉庫別在庫一覧', icon: BarChart3, featureId: 'stocks' },
      {
        href: '/dashboard/forecast',
        label: '予測在庫一覧',
        icon: TrendingUp,
        featureId: 'forecast',
      },
    ],
  },
  {
    label: '発注管理',
    categoryKey: 'D',
    items: [
      { href: '/dashboard/orders', label: '発注入力', icon: ShoppingCart, featureId: 'orders' },
    ],
  },
  {
    label: 'システム管理',
    categoryKey: 'E',
    items: [
      { href: '/dashboard/permissions', label: '権限設定', icon: Shield, featureId: 'permissions' },
      {
        href: '/dashboard/system-settings',
        label: 'システム設定',
        icon: Settings,
        featureId: 'system-parameters',
      },
      {
        href: '/dashboard/list-preferences',
        label: '一覧ページサイズ',
        icon: Sliders,
        featureId: 'system-parameters',
      },
      {
        href: '/dashboard/object-types',
        label: '台帳管理',
        icon: TableProperties,
        featureId: 'object-types',
      },
    ],
  },
];

/**
 * featureId をキーに NavItem を引ける逆引きマップ。
 * お気に入りセクションは featureId しか持たないため、ここから label / icon / href を解決する。
 *
 * 同じ featureId を持つ NavItem が複数ある場合（例: system-parameters は
 * "システム設定" と "一覧ページサイズ" の 2 つ）、**最初に出現したものを採用**する（first-win）。
 * permission matrix の `LOGICAL_FEATURES` と解決方向を揃える。
 */
export const navItemByFeatureId: Partial<Record<FeatureId, NavItem>> = (() => {
  const map: Partial<Record<FeatureId, NavItem>> = {};
  for (const cat of navCategories) {
    for (const item of cat.items) {
      if (item.featureId && !isObjectTypePermissionId(item.featureId) && !map[item.featureId]) {
        map[item.featureId] = item;
      }
    }
  }
  return map;
})();
