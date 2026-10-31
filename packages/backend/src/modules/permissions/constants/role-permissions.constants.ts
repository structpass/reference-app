export interface FeaturePermission {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export type RoleDefaults = Record<string, FeaturePermission>;

const RO_USER: FeaturePermission = {
  canView: true,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
};
const RW_ADMIN: FeaturePermission = {
  canView: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
};
const CRU_USER: FeaturePermission = {
  canView: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
};
// View + Create のみ。file-import の「ツールアクセス権 + 取込実行権」を表す（update/delete は概念なし）。
const VC_USER: FeaturePermission = {
  canView: true,
  canCreate: true,
  canUpdate: false,
  canDelete: false,
};
const NONE: FeaturePermission = {
  canView: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
};

const masterRO: RoleDefaults = {
  WH_USER: RO_USER,
  WH_ADMIN: RW_ADMIN,
  OF_USER: RO_USER,
  OF_ADMIN: RW_ADMIN,
};

const operationCRU: RoleDefaults = {
  WH_USER: CRU_USER,
  WH_ADMIN: RW_ADMIN,
  OF_USER: CRU_USER,
  OF_ADMIN: RW_ADMIN,
};

const allRO: RoleDefaults = {
  WH_USER: RO_USER,
  WH_ADMIN: RO_USER,
  OF_USER: RO_USER,
  OF_ADMIN: RO_USER,
};

const sysAdminOnly: RoleDefaults = {
  WH_USER: NONE,
  WH_ADMIN: NONE,
  OF_USER: NONE,
  OF_ADMIN: NONE,
};

// file-import: 取込はアクションであり CRUD 4 区分に綺麗に乗らない。
// view = ツールアクセス権 / create = 取込実行権（= bulk create/update の書き込み）。SEC-H3 で
// commit を create で gate するため、本 map では WH_ADMIN / OF_ADMIN に view + create を付与する
// （update/delete は取込ツールに概念がないため未付与＝最小権限）。一般 user (WH_USER/OF_USER) は不許可。
// SYS_ADMIN は本 map に載せない — service 層 (getEffectivePermissionMap) の全機能バイパスで CRUD になる。
const adminViewCreate: RoleDefaults = {
  WH_USER: NONE,
  WH_ADMIN: VC_USER,
  OF_USER: NONE,
  OF_ADMIN: VC_USER,
};

/**
 * SYS_ADMIN 専用機能。非 SYS_ADMIN ロールへは権限を立てられない（固定 OFF）。
 *
 * - 保存 API は非 SYS_ADMIN ロール向けに `true` を立てる入力を 400 で拒否する（permissions.service）。
 * - 実効権限は DB `RolePermission` 行が残っていても非 SYS_ADMIN では既定（NONE）を上書きさせない。
 * - frontend `use-permission-matrix.ts` の `SYS_ADMIN_ONLY_FEATURES`、seed
 *   `prisma/seed/permissions.ts` の `SYS_ADMIN_ONLY_FEATURES` と同じ機能を指す。
 *   片側だけ増減するとその側のテストが落ちる（実測で確認済み）:
 *   本ファイルの role-permissions.constants.spec.ts は `DEFAULT_ROLE_PERMISSIONS` の
 *   全ロール NONE との一致、frontend は use-permission-matrix.test.ts が集合の一致、
 *   seed は seed-permissions.spec.ts が分類の網羅性（fail-closed）で捕捉する。
 */
export const SYS_ADMIN_ONLY_FEATURES: ReadonlySet<string> = new Set([
  'permissions',
  'system-parameters',
  'object-types',
]);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RoleDefaults> = {
  products: masterRO,
  warehouses: masterRO,
  carriers: masterRO,
  suppliers: masterRO,
  categories: masterRO,
  // SYS_ADMIN_ONLY_FEATURES: 非 SYS_ADMIN は NONE 固定。保存 API の入力検証と実効権限の
  // overlay 抑制（permissions.service）が、この既定を DB 行で覆せないようにする。
  permissions: sysAdminOnly,
  users: masterRO,
  groups: masterRO,
  receivings: operationCRU,
  shipments: operationCRU,
  shipping: allRO,
  stocktakings: operationCRU,
  stocks: allRO,
  forecast: allRO,
  'system-parameters': sysAdminOnly,
  orders: operationCRU,
  // file-import は WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。view = ツールアクセス / create = 取込実行（SEC-H3）。
  'file-import': adminViewCreate,
  // ref-0069 / ref-0079: object-types は SYS_ADMIN 専用のマスタ管理機能。`sysAdminOnly` map は
  // SYS_ADMIN bypass（getEffectivePermissionMap）で全 action 許可され、非 admin は NONE。
  // seed 側も SYS_ADMIN_ONLY_FEATURES へ object-types を含めて揃えた（ref-0079・初期値と初期データの一致）。
  'object-types': sysAdminOnly,
};
