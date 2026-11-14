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
  // 台帳管理（object-types）と自由定義台帳（custom）は同じ台帳の一覧なので同じ骨格を使う（d1172）。
  'object-types',
] as const;

export type TableId = (typeof TABLE_IDS)[number];
