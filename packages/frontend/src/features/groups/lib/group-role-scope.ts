import { UserRole } from '@struct-pass/shared';

/**
 * グループの登録・編集フォームで「選ぶと必ず失敗する role」を選択肢に残さないための判定（v2-427）。
 *
 * 正本は backend の `packages/backend/src/modules/groups/constants/group-membership-scope.ts`。
 * API は次を拒否する（403）。
 *
 * - `role=SYS_ADMIN` のグループの作成・変更・削除、および `role` を `SYS_ADMIN` へ変える操作は
 *   `SYS_ADMIN` のみ（`assertSysAdminArea`）。
 * - 系統をまたぐ `role` の作成・付け替えは `SYS_ADMIN` のみ（`canCreateGroupOfRole` /
 *   `canChangeGroupRole`）。`WH_*` は倉庫系統、`OF_*` は事務系統で、`SYS_ADMIN` は倉庫系統に
 *   属するが、そもそも `SYS_ADMIN` 以外は選べない。
 *
 * 画面側はこの2つを同じ形で写し、呼び出し元のロールで選択肢を絞る。系統の判定を backend と
 * 二重に持つが、画面は「選ぶと失敗する候補を出さない」ためだけに使い、可否の最終判断は API が
 * 持つ（画面の絞り込みを迂回した入力も API が 403 で止める）。
 */
export type GroupFamily = 'WH' | 'OF';

/** グループのロールから系統を決める（backend の `groupFamilyOf` と同じ表）。 */
export function groupFamilyOf(role: UserRole): GroupFamily {
  switch (role) {
    case UserRole.OF_USER:
    case UserRole.OF_ADMIN:
      return 'OF';
    case UserRole.SYS_ADMIN:
    case UserRole.WH_ADMIN:
    case UserRole.WH_USER:
      return 'WH';
  }
}

/** 選択肢に出すロールの並び順（表示順を固定し、呼び出し元によって並びが変わらないようにする）。 */
const ROLE_ORDER: readonly UserRole[] = [
  UserRole.WH_USER,
  UserRole.WH_ADMIN,
  UserRole.OF_USER,
  UserRole.OF_ADMIN,
  UserRole.SYS_ADMIN,
];

/**
 * 呼び出し元が新規作成で選べるロール（backend の `canCreateGroupOfRole` と同じ基準）。
 *
 * 作成には「現在の系統」が無いため、呼び出し元の系統と作ろうとしている系統の一致で決める。
 * `SYS_ADMIN` は全系統と `SYS_ADMIN` を選べる（全機能バイパスの維持）。
 */
export function selectableGroupRoles(
  callerRole: UserRole | null | undefined,
  options: { currentRole?: UserRole } = {},
): UserRole[] {
  if (callerRole === UserRole.SYS_ADMIN) return [...ROLE_ORDER];

  // 一般ユーザーはそもそも `groups:create` / `groups:update` を持たず画面に到達しないが、
  // 到達した場合に誤って選択肢を出さない側へ倒す（選択できる管理者ロールだけを返す）。
  if (callerRole !== UserRole.WH_ADMIN && callerRole !== UserRole.OF_ADMIN) return [];

  const family = callerRole === UserRole.WH_ADMIN ? 'WH' : 'OF';
  const selectable = ROLE_ORDER.filter(
    (role) => role !== UserRole.SYS_ADMIN && groupFamilyOf(role) === family,
  );

  // 編集中のグループが `SYS_ADMIN`（到達できるのは SYS_ADMIN だけ）や相手系統の時は、選択肢に
  // 無い値が現在値になる。表示が壊れないよう、現在値を選択肢の先頭へ足して保持する
  // （値が消えると保存時に role が未選択になり、無関係な 400 を招く）。
  const current = options.currentRole;
  if (current !== undefined && !selectable.includes(current)) {
    return [current, ...selectable];
  }

  return selectable;
}
