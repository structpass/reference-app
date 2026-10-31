// 列幅永続化機能用の table 識別子 SSOT。
// 各 list page の DataTable に渡す `tableId` prop と完全一致する。
// backend の入力検証 (class-validator @IsIn) と frontend の型安全（TableId）の双方が import する。
export const TABLE_IDS = [
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
] as const;

export type TableId = (typeof TABLE_IDS)[number];
