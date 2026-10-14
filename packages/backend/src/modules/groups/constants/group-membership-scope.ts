import { UserRole } from '@prisma/client';

/**
 * グループ編成（所属の追加・削除）のスコープ（v2-425）。
 *
 * グループ所属は掲示の公開範囲（`AnnouncementRole.groupId` × `UserGroup`）を決めるため、
 * 所属を足せることはそのまま閲覧権限を配れることと同じ意味を持つ。v2-412 で自己追加・
 * SYS_ADMIN 領域・宛先グループの削除を塞いだが、「どのグループを誰が編成してよいか」を
 * 定義する軸が無いままだった（ADR 0020 が残存範囲として明示）。
 *
 * ここでは編成の範囲を **グループのロール系統（`Group.role`）と管理者ロールの系統** の
 * 一致で決める。
 *
 * - `Group.role = WH_*` のグループは WH 系統の管理者（`WH_ADMIN`）が編成する。
 * - `Group.role = OF_*` のグループは OF 系統の管理者（`OF_ADMIN`）が編成する。
 * - `SYS_ADMIN` は全グループを編成する（既存の全機能バイパスの維持）。
 * - 一般ユーザー（`WH_USER` / `OF_USER`）はグループを編成しない（編成は管理者の役割。
 *   権限マトリクスの `groups` は一般ユーザーに参照のみを与えており、service 層の検査で
 *   それを明示する）。
 *
 * `Group.role` はこれまで表示用で、v2-412 でグループの作成・変更・削除の認可に読む配線を
 * 1本足した。本検査で所属の境界にも読む（ADR 0020 の `revisit` 条件にある「所属の境界として
 * 使う」に対応し、掲示の可視性など他の認可軸には使わない）。
 *
 * seed は 20 グループを `role` 未設定で投入する。Prisma の既定は `WH_USER` なので、
 * 既定グループは WH 系統として扱う（`groups.role` は NOT NULL DEFAULT 'WH_USER' で、null 行は
 * 存在しない。スキーマの実体に合わせ、null は受け取らない）。
 */
export type GroupFamily = 'WH' | 'OF';

/** グループのロールから系統を決める。`role` は NOT NULL なので null は来ない。 */
export function groupFamilyOf(groupRole: UserRole): GroupFamily {
  switch (groupRole) {
    case UserRole.OF_USER:
    case UserRole.OF_ADMIN:
      return 'OF';
    case UserRole.SYS_ADMIN:
    case UserRole.WH_ADMIN:
    case UserRole.WH_USER:
      return 'WH';
  }
}

/** 系統ごとに、その系統のグループを編成できる管理者ロール。 */
const FAMILY_ADMIN_ROLE: Record<GroupFamily, UserRole> = {
  WH: UserRole.WH_ADMIN,
  OF: UserRole.OF_ADMIN,
};

/** 系統の日本語名（拒否の文言に使う）。 */
const FAMILY_LABEL: Record<GroupFamily, string> = {
  WH: '倉庫',
  OF: '事務',
};

/** 編成した側の系統から見た、相手グループの呼び方（拒否の文言に使う）。 */
const FAMILY_OWNER_LABEL: Record<GroupFamily, string> = {
  WH: '倉庫担当の管理者',
  OF: '事務担当の管理者',
};

/**
 * 呼び出し元が対象グループを編成してよいかを判定する。
 *
 * 拒否（`false`）の条件は2つ。
 * 1. 呼び出し元が管理者でない（`WH_USER` / `OF_USER`）。
 * 2. 呼び出し元の系統が対象グループの系統と違う（例: `OF_ADMIN` → `WH_*` グループ）。
 *
 * `SYS_ADMIN` は無条件で `true`。
 */
export function canOrganizeGroup(
  callerRole: UserRole | null | undefined,
  groupRole: UserRole,
): boolean {
  if (callerRole === UserRole.SYS_ADMIN) return true;
  if (callerRole !== UserRole.WH_ADMIN && callerRole !== UserRole.OF_ADMIN) return false;
  return callerRole === FAMILY_ADMIN_ROLE[groupFamilyOf(groupRole)];
}

/**
 * グループの `role` を付け替えてよいかを判定する（系統をまたぐ書き換えの禁止）。
 *
 * 編成の境界は `Group.role` を根拠にするため、その根拠を編成の側が書き換えられると境界が
 * 無効になる（実測: OF_ADMIN が OF 系統のグループを `role=WH_USER` へ PUT してから WH_ADMIN が
 * 第三者を追加すると 201 で通り、系統をまたぐ編成が成立した）。
 * 書き換えを **SYS_ADMIN だけ** に閉じることで、境界の前提を編成の側から動かせなくする。
 *
 * 同じ系統の中での書き換え（`WH_USER` ↔ `WH_ADMIN`）は許す。編成の範囲（系統）を変えないため、
 * グループのロールを運用で調整する既存の操作を止める理由が無い。`role` の指定が無い更新も許す。
 */
export function canChangeGroupRole(
  callerRole: UserRole | null | undefined,
  currentRole: UserRole,
  nextRole: UserRole | undefined,
): boolean {
  if (callerRole === UserRole.SYS_ADMIN) return true;
  if (nextRole === undefined) return true;
  return groupFamilyOf(currentRole) === groupFamilyOf(nextRole);
}

/** 系統をまたぐ書き換えを拒否した時の案内。 */
export function groupRoleChangeDenialMessage(): string {
  return 'グループの担当系統を変更できるのはシステム管理者のみです。変更が必要な場合はシステム管理者へご依頼ください';
}

/**
 * グループを **新しく作る** 時に、その系統を選んでよいかを判定する（v2-425 / 独立レビュー F-4）。
 *
 * 系統をまたぐ `role` の変更は `canChangeGroupRole` で閉じたが、作成経路にも同じ構造の穴が
 * 残っていた。`assertSysAdminArea` は「`SYS_ADMIN` が含まれる時だけ拒否する」検査なので、
 * 系統をまたぐ `role` を指定した作成（WH_ADMIN が `role=OF_USER` で作る）は素通りする。
 * その結果、作った本人が編成できないグループができ、相手系統の管理者がそれを編成できた
 * （実測: WH_ADMIN が `role=OF_USER` で作成 201 → OF_ADMIN の追加 201・作成者は 403）。
 *
 * 作成には「現在の系統」が無いため、**呼び出し元の系統と作ろうとしている系統の一致**を見る。
 * `SYS_ADMIN` は全系統を作れる（既存の全機能バイパス）。
 */
export function canCreateGroupOfRole(
  callerRole: UserRole | null | undefined,
  role: UserRole,
): boolean {
  if (callerRole === UserRole.SYS_ADMIN) return true;
  if (callerRole !== UserRole.WH_ADMIN && callerRole !== UserRole.OF_ADMIN) return false;
  return callerRole === FAMILY_ADMIN_ROLE[groupFamilyOf(role)];
}

/** 系統をまたぐ作成を拒否した時の案内。 */
export function groupCreateDenialMessage(role: UserRole): string {
  return `担当系統の異なるグループは作成できません（${FAMILY_LABEL[groupFamilyOf(role)]}担当のグループは${FAMILY_OWNER_LABEL[groupFamilyOf(role)]}が作成します）。変更が必要な場合はシステム管理者へご依頼ください`;
}

/** 編成できない時の案内（誰に依頼すればよいかまで示す。行き止まりを作らない）。 */
export function groupScopeDenialMessage(
  callerRole: UserRole | null | undefined,
  groupRole: UserRole,
): string {
  const target = groupFamilyOf(groupRole);
  if (callerRole !== UserRole.WH_ADMIN && callerRole !== UserRole.OF_ADMIN) {
    return `グループの編成は管理者のみ実行できます（このグループは${FAMILY_LABEL[target]}担当のグループです）`;
  }
  return `担当系統の異なるグループは編成できません（このグループは${FAMILY_OWNER_LABEL[target]}が編成します）。変更が必要な場合はシステム管理者へご依頼ください`;
}
