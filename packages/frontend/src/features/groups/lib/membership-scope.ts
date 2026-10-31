import { UserRole } from '@struct-pass/shared';

/**
 * グループ編成（所属の追加・削除）の範囲を画面側で判定する（v2-462）。
 *
 * サーバー側の正本は `packages/backend/src/modules/groups/constants/group-membership-scope.ts`
 * の `canOrganizeGroup` で、編成できるのは「グループのロール系統（`Group.role`）と一致する
 * 系統の管理者」だけ（`SYS_ADMIN` は全系統）。一般ユーザーは編成しない。
 *
 * 画面はこれまでこの軸を持たず、`GroupMembers` へ渡すのが `groupId` と `readonly` だけだった
 * ため、編成できない系統のグループでも追加候補と追加ボタンを出し続け、選ぶと必ず 403 に
 * なっていた（v2-424 で除外した「自分自身・SYS_ADMIN ロール」とは別の軸）。
 *
 * **ここでは系統だけを見る。** 呼び出し元が管理者かどうかは `readonly`（呼び出し元の画面に
 * 編集権があるか）が既に表しているため重ねない。一般ユーザーは `readonly` で追加 UI ごと
 * 消えるので、この判定は管理者の系統違いだけを落とす。
 */
export type GroupFamily = 'WH' | 'OF';

/**
 * グループのロールから系統を決める（サーバー側 `groupFamilyOf` と同じ割り当て）。
 *
 * `SYS_ADMIN` はどの系統の管理者でも編成できないため、系統を返さない（`null`）。
 * サーバー側は `SYS_ADMIN` を WH 系統として扱うが、そこへ到達するのは `SYS_ADMIN` 自身だけで、
 * `SYS_ADMIN` は判定の先頭で無条件に通る。画面側で同じ扱いにすると「WH_ADMIN は
 * `role=SYS_ADMIN` のグループを編成できる」と読めてしまうため、ここでは系統を持たせない。
 */
export function groupFamilyOf(role: UserRole | null | undefined): GroupFamily | null {
  switch (role) {
    case UserRole.OF_USER:
    case UserRole.OF_ADMIN:
      return 'OF';
    case UserRole.WH_USER:
    case UserRole.WH_ADMIN:
      return 'WH';
    default:
      return null;
  }
}

/**
 * 呼び出し元がこのグループを編成してよいかを判定する（管理者の系統の一致だけを見る）。
 *
 * - `SYS_ADMIN` は全系統を編成できる（サーバーの全機能バイパスと同じ）。
 * - `WH_ADMIN` は WH 系統、`OF_ADMIN` は OF 系統だけを編成できる。
 * - 一般ユーザー（`WH_USER` / `OF_USER`）は編成しない。
 * - グループの `role` が未取得（`undefined`）の時は判定しない（`false` を返し、候補を出す側へ
 *   倒さない）。渡されていないことを「編成できる」と読み替えると、元の不具合へ戻る。
 */
export function canOrganizeGroup(
  callerRole: UserRole | null | undefined,
  groupRole: UserRole | null | undefined,
): boolean {
  if (!callerRole || !groupRole) return false;
  if (callerRole === UserRole.SYS_ADMIN) return true;
  const callerFamily = groupFamilyOf(callerRole);
  if (callerFamily !== 'WH' && callerFamily !== 'OF') return false;
  if (callerRole !== UserRole.WH_ADMIN && callerRole !== UserRole.OF_ADMIN) return false;
  return callerFamily === groupFamilyOf(groupRole);
}

/** 系統の日本語名（画面の案内に使う）。 */
const FAMILY_LABEL: Record<GroupFamily, string> = {
  WH: '倉庫',
  OF: '事務',
};

/** 編成する側の呼び方（画面の案内に使う）。 */
const FAMILY_OWNER_LABEL: Record<GroupFamily, string> = {
  WH: '倉庫担当の管理者',
  OF: '事務担当の管理者',
};

/**
 * 編成できない理由（誰に依頼すればよいかまで示す。行き止まりを作らない）。
 * サーバー側 `groupScopeDenialMessage` と同じ趣旨を、操作する前に画面で示すための文言。
 */
export function groupScopeDenialMessage(groupRole: UserRole | null | undefined): string {
  const family = groupFamilyOf(groupRole);
  if (!family) return 'このグループは編成できません';
  return `担当系統の異なるグループは編成できません（このグループは${FAMILY_LABEL[family]}担当のグループで、${FAMILY_OWNER_LABEL[family]}が編成します）。変更が必要な場合はシステム管理者へご依頼ください`;
}
