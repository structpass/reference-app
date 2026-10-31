import { PrismaClient } from '@prisma/client';

type CrudPerm = { canView: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const R_ONLY: CrudPerm = { canView: true, canCreate: false, canUpdate: false, canDelete: false };
const CRUD: CrudPerm = { canView: true, canCreate: true, canUpdate: true, canDelete: true };
const CRU: CrudPerm = { canView: true, canCreate: true, canUpdate: true, canDelete: false };
// View + Create のみ（file-import: ツールアクセス権 + 取込実行権。update/delete は概念なし）。
const VC: CrudPerm = { canView: true, canCreate: true, canUpdate: false, canDelete: false };
const NONE: CrudPerm = { canView: false, canCreate: false, canUpdate: false, canDelete: false };

// ref-0079: FEATURES は export し、コード側 DEFAULT_ROLE_PERMISSIONS とのキー集合一致をテストで固定する。
// 片方にだけ機能を足すとテストが失敗する（初期値と初期データの乖離を再発させない）。
export const FEATURES = [
  'products',
  'warehouses',
  'carriers',
  'suppliers',
  'categories',
  'permissions',
  'users',
  'groups',
  'receivings',
  'shipments',
  'shipping',
  'stocktakings',
  'stocks',
  'forecast',
  'orders',
  'system-parameters',
  'file-import',
  'object-types',
];
const MASTER_FEATURES = [
  'products',
  'warehouses',
  'carriers',
  'suppliers',
  'categories',
  'users',
  'groups',
];
const DOCUMENT_FEATURES = ['receivings', 'shipments', 'stocktakings', 'orders'];
const VIEW_ONLY_FEATURES = ['shipping', 'stocks', 'forecast'];
// permissions / system-parameters / object-types は SYS_ADMIN 専用（他 role は参照すらさせない）。
// ref-0079: object-types を追加し、コード側の sysAdminOnly（role-permissions.constants.ts）と初期値を揃えた。
const SYS_ADMIN_ONLY_FEATURES = ['system-parameters', 'permissions', 'object-types'];
// file-import: WH_ADMIN / OF_ADMIN は view + create（取込実行権）、一般 user は不許可。SYS_ADMIN は下の分岐で CRUD。
// （取込 = bulk create/update の書き込み操作。SEC-H3 で commit を create で gate するため。
//  update/delete は取込ツールに概念がないため付与しない＝最小権限）
const ADMIN_VIEW_CREATE_FEATURES = ['file-import'];
const ROLES = ['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN', 'SYS_ADMIN'] as const;

// ref-0079: 分類漏れ検出のため、全分類の合併（featureId → 分類名）をテストから参照できるよう export する。
// 同じ機能が複数の分類配列に重複して入った場合は構築時に throw（先勝ちの seed 分岐と矛盾しないように）。
export const FEATURE_CATEGORY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const assign = (feats: readonly string[], category: string) => {
    for (const f of feats) {
      if (map[f]) {
        throw new Error(
          `[seed/permissions] 機能 ${f} が複数の分類に重複して含まれています（${map[f]} と ${category}）。` +
            '各機能はちょうど 1 つの分類に属すること。',
        );
      }
      map[f] = category;
    }
  };
  assign(MASTER_FEATURES, 'MASTER');
  assign(DOCUMENT_FEATURES, 'DOCUMENT');
  assign(VIEW_ONLY_FEATURES, 'VIEW_ONLY');
  assign(SYS_ADMIN_ONLY_FEATURES, 'SYS_ADMIN_ONLY');
  assign(ADMIN_VIEW_CREATE_FEATURES, 'ADMIN_VIEW_CREATE');
  return map;
})();

const isAdmin = (r: string) => r === 'WH_ADMIN' || r === 'OF_ADMIN' || r === 'SYS_ADMIN';

export async function seedRolePermissions(prisma: PrismaClient) {
  const defs: { role: (typeof ROLES)[number]; featureId: string; perm: CrudPerm }[] = [];

  for (const role of ROLES) {
    for (const feat of FEATURES) {
      let perm: CrudPerm;
      if (role === 'SYS_ADMIN') {
        // SYS_ADMIN は VIEW_ONLY 系も含めて全機能 CRUD（system-parameters も含む）
        perm = VIEW_ONLY_FEATURES.includes(feat) ? R_ONLY : CRUD;
      } else if (SYS_ADMIN_ONLY_FEATURES.includes(feat)) {
        perm = NONE;
      } else if (ADMIN_VIEW_CREATE_FEATURES.includes(feat)) {
        perm = isAdmin(role) ? VC : NONE;
      } else if (MASTER_FEATURES.includes(feat)) {
        perm = isAdmin(role) ? CRUD : R_ONLY;
      } else if (DOCUMENT_FEATURES.includes(feat)) {
        perm = isAdmin(role) ? CRUD : CRU;
      } else if (VIEW_ONLY_FEATURES.includes(feat)) {
        // shipping / stocks / forecast: 全ロール閲覧可（code 側 allRO と一致。admin も書き込みなし）。
        perm = R_ONLY;
      } else {
        // ref-0079: 分類漏れは fail-closed にする（黙って全ロール閲覧可へ落とさない）。
        // seed は dev/test 専用スクリプトで、分類漏れは開発時のミスなので止めて気づかせる。
        throw new Error(
          `[seed/permissions] 分類漏れの機能があります: ${feat}（role=${role}）。` +
            '新しい機能は必ず MASTER / DOCUMENT / VIEW_ONLY / SYS_ADMIN_ONLY / ADMIN_VIEW_CREATE の' +
            'いずれかの分類へ入れてください。',
        );
      }
      defs.push({ role, featureId: feat, perm });
    }
  }

  for (const def of defs) {
    await prisma.rolePermission.upsert({
      where: { role_featureId: { role: def.role, featureId: def.featureId } },
      update: { ...def.perm },
      create: { role: def.role, featureId: def.featureId, ...def.perm },
    });
  }
  console.log('RolePermissions created:', defs.length);
}
