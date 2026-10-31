import type { badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '有効',
  INACTIVE: '無効',
  DISCONTINUED: '廃止',
  DRAFT: '下書き',
  CONFIRMED: '確定',
  COMPLETED: '完了',
  SHIPPED: '出荷済',
  ORDERED: '発注済',
  PARTIALLY_RECEIVED: '一部入荷',
  // forecast alert（表記は ForecastAlert 型由来）
  shortageRisk: '不足リスク',
  surplus: '過剰',
  normal: '正常',
};

export const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  DISCONTINUED: 'destructive',
  DRAFT: 'outline',
  CONFIRMED: 'success',
  COMPLETED: 'secondary',
  SHIPPED: 'default',
  ORDERED: 'default',
  PARTIALLY_RECEIVED: 'outline',
  shortageRisk: 'destructive',
  surplus: 'warning',
  normal: 'success',
};

// 旧21機能ID（後方互換用）
export const FEATURE_IDS = {
  PRODUCT_LIST: 'A-1',
  PRODUCT_CREATE: 'A-2',
  PRODUCT_EDIT: 'A-3',
  WAREHOUSE_LIST: 'A-4',
  WAREHOUSE_CREATE: 'A-5',
  WAREHOUSE_EDIT: 'A-6',
  CARRIER_LIST: 'A-7',
  CARRIER_CREATE: 'A-8',
  CARRIER_EDIT: 'A-9',
  PERMISSION_SETTINGS: 'A-10',
  USER_LIST: 'A-11',
  USER_CREATE: 'A-12',
  GROUP_LIST: 'A-13',
  GROUP_CREATE: 'A-14',
  RECEIVING: 'B-1',
  SHIPMENT: 'B-2',
  SHIPPING_LIST: 'B-3',
  STOCKTAKING: 'C-1',
  STOCK_LIST: 'C-2',
  FORECAST: 'C-3',
  ORDER: 'D-1',
} as const;

// 16論理機能ID（画面が権限ゲートへ渡す ID の対応表）
// shared FeatureId の UI 公開サブセット（全体は 18 件）。file-import / object-types は、
// 各画面が権限 ID を直接参照するためここには含めない（取込は 'file-import'、台帳は固定 'object-types' と
// ユーザー定義台帳の動的 ID object-type:<key>）。権限マトリクスの機能行は
// features/permissions/lib/feature-list.ts が nav-config から導出する。
export const LOGICAL_FEATURE_IDS = {
  PRODUCTS: 'products',
  WAREHOUSES: 'warehouses',
  CARRIERS: 'carriers',
  SUPPLIERS: 'suppliers',
  PERMISSIONS: 'permissions',
  USERS: 'users',
  GROUPS: 'groups',
  RECEIVINGS: 'receivings',
  SHIPMENTS: 'shipments',
  SHIPPING: 'shipping',
  STOCKTAKINGS: 'stocktakings',
  STOCKS: 'stocks',
  FORECAST: 'forecast',
  ORDERS: 'orders',
  CATEGORIES: 'categories',
  SYSTEM_PARAMETERS: 'system-parameters',
} as const;
