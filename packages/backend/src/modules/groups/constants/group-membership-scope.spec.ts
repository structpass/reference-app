import { UserRole } from '@prisma/client';
import {
  canChangeGroupRole,
  canCreateGroupOfRole,
  canOrganizeGroup,
  groupCreateDenialMessage,
  groupFamilyOf,
  groupRoleChangeDenialMessage,
  groupScopeDenialMessage,
  type GroupFamily,
} from './group-membership-scope';

/**
 * v2-425: グループ編成の範囲（誰が誰を編成できるか）の可否マトリクス。
 *
 * 判定を service から分けてここへ置いた理由は、可否の表そのものを1か所で読めるようにするため
 * （e2e は実 API の応答で同じ表をなぞる）。
 */
describe('group-membership-scope', () => {
  describe('groupFamilyOf', () => {
    it.each([
      [UserRole.WH_USER, 'WH'],
      [UserRole.WH_ADMIN, 'WH'],
      [UserRole.OF_USER, 'OF'],
      [UserRole.OF_ADMIN, 'OF'],
      // SYS_ADMIN グループは系統で分けない（全グループを SYS_ADMIN が編成する）。
      [UserRole.SYS_ADMIN, 'WH'],
    ])('%s は %s 系統', (role, expected) => {
      expect(groupFamilyOf(role as UserRole)).toBe(expected as GroupFamily);
    });

    it('groups.role は NOT NULL DEFAULT WH_USER のため、seed の既定グループは WH 系統になる', () => {
      // スキーマの実体（prisma/schema.prisma の Group.role @default(WH_USER)）に合わせ、
      // null を受け取る分岐は持たない。既定グループは WH_ADMIN が編成できる。
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.WH_USER)).toBe(true);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.WH_USER)).toBe(false);
    });
  });

  describe('canOrganizeGroup — 呼び出し元ロール × 宛先グループの系統', () => {
    const whGroup = UserRole.WH_USER;
    const ofGroup = UserRole.OF_ADMIN;

    it('SYS_ADMIN は全グループを編成できる（全機能バイパスの維持）', () => {
      for (const group of [whGroup, ofGroup, UserRole.SYS_ADMIN]) {
        expect(canOrganizeGroup(UserRole.SYS_ADMIN, group)).toBe(true);
      }
    });

    it('WH_ADMIN は WH 系統のグループだけを編成できる', () => {
      expect(canOrganizeGroup(UserRole.WH_ADMIN, whGroup)).toBe(true);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, ofGroup)).toBe(false);
    });

    it('OF_ADMIN は OF 系統のグループだけを編成できる', () => {
      expect(canOrganizeGroup(UserRole.OF_ADMIN, ofGroup)).toBe(true);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, whGroup)).toBe(false);
    });

    it('一般ユーザーは系統を問わず編成できない（編成は管理者の役割）', () => {
      for (const caller of [UserRole.WH_USER, UserRole.OF_USER, null]) {
        for (const group of [whGroup, ofGroup]) {
          expect(canOrganizeGroup(caller, group)).toBe(false);
        }
      }
    });
  });

  describe('groupScopeDenialMessage — 拒否の理由と次の一手', () => {
    it('系統違いの拒否は、そのグループを編成する側と依頼先を示す', () => {
      const message = groupScopeDenialMessage(UserRole.OF_ADMIN, UserRole.WH_USER);
      expect(message).toContain('倉庫担当の管理者');
      expect(message).toContain('システム管理者');
    });

    it('非管理者の拒否は、編成が管理者の役割であることを示す', () => {
      const message = groupScopeDenialMessage(UserRole.WH_USER, UserRole.WH_USER);
      expect(message).toContain('管理者のみ');
    });
  });

  /**
   * 系統をまたぐ編成の前提（`Group.role`）を編成の側が書き換えられないようにする（v2-425）。
   * 独立レビュー F-1 の実測: これが無いと OF_ADMIN が OF 系統のグループを role=WH_USER へ
   * PUT してから WH_ADMIN が第三者を追加すると 201 で通り、境界が成立しなかった。
   */
  describe('canChangeGroupRole — 系統をまたぐ role の書き換えの禁止', () => {
    it('SYS_ADMIN は系統をまたぐ書き換えもできる', () => {
      expect(canChangeGroupRole(UserRole.SYS_ADMIN, UserRole.WH_USER, UserRole.OF_ADMIN)).toBe(
        true,
      );
    });

    it('系統をまたぐ書き換えは管理者でもできない（境界の前提を動かせない）', () => {
      expect(canChangeGroupRole(UserRole.OF_ADMIN, UserRole.OF_USER, UserRole.WH_USER)).toBe(false);
      expect(canChangeGroupRole(UserRole.WH_ADMIN, UserRole.WH_USER, UserRole.OF_ADMIN)).toBe(
        false,
      );
    });

    it('同じ系統の中での書き換えは許す（編成の範囲が変わらない）', () => {
      expect(canChangeGroupRole(UserRole.WH_ADMIN, UserRole.WH_USER, UserRole.WH_ADMIN)).toBe(true);
      expect(canChangeGroupRole(UserRole.OF_ADMIN, UserRole.OF_USER, UserRole.OF_ADMIN)).toBe(true);
    });

    it('role を指定しない更新は許す（他のフィールドの更新を止めない）', () => {
      expect(canChangeGroupRole(UserRole.OF_ADMIN, UserRole.OF_USER, undefined)).toBe(true);
    });

    it('一般ユーザーの拒否はロール単位の権限（groups:update）が持ち、本判定は重ねない', () => {
      // 本判定は「系統をまたぐ書き換えを閉じる」専用。同じ系統の中の書き換えはここでは素通りし、
      // 拒否は controller の @RequirePermission('groups','update') が行う（基準を二重に持たない）。
      expect(canChangeGroupRole(UserRole.WH_USER, UserRole.WH_USER, UserRole.WH_ADMIN)).toBe(true);
    });

    it('拒否の文言は依頼先（システム管理者）を示す', () => {
      expect(groupRoleChangeDenialMessage()).toContain('システム管理者');
    });
  });

  /**
   * 作成経路の系統偽装（v2-425 / 独立レビュー F-4）。更新経路と同じ構造の穴で、これが無いと
   * WH_ADMIN が `role=OF_USER` で作成でき、作った本人が編成できないグループを OF_ADMIN が
   * 編成できる状態になる（実測）。
   */
  describe('canCreateGroupOfRole — 作成時の系統偽装の禁止', () => {
    it('SYS_ADMIN は全系統のグループを作成できる', () => {
      for (const role of [UserRole.WH_USER, UserRole.OF_USER, UserRole.SYS_ADMIN]) {
        expect(canCreateGroupOfRole(UserRole.SYS_ADMIN, role)).toBe(true);
      }
    });

    it('WH_ADMIN は WH 系統のグループだけを作成できる', () => {
      expect(canCreateGroupOfRole(UserRole.WH_ADMIN, UserRole.WH_USER)).toBe(true);
      expect(canCreateGroupOfRole(UserRole.WH_ADMIN, UserRole.WH_ADMIN)).toBe(true);
      expect(canCreateGroupOfRole(UserRole.WH_ADMIN, UserRole.OF_USER)).toBe(false);
      expect(canCreateGroupOfRole(UserRole.WH_ADMIN, UserRole.OF_ADMIN)).toBe(false);
    });

    it('OF_ADMIN は OF 系統のグループだけを作成できる', () => {
      expect(canCreateGroupOfRole(UserRole.OF_ADMIN, UserRole.OF_USER)).toBe(true);
      expect(canCreateGroupOfRole(UserRole.OF_ADMIN, UserRole.OF_ADMIN)).toBe(true);
      expect(canCreateGroupOfRole(UserRole.OF_ADMIN, UserRole.WH_USER)).toBe(false);
    });

    it('一般ユーザーは作成できない（groups:create を持たない）', () => {
      for (const caller of [UserRole.WH_USER, UserRole.OF_USER]) {
        expect(canCreateGroupOfRole(caller, UserRole.WH_USER)).toBe(false);
      }
    });

    it('拒否の文言は、その系統を作る側と依頼先を示す', () => {
      const message = groupCreateDenialMessage(UserRole.OF_USER);
      expect(message).toContain('事務担当の管理者');
      expect(message).toContain('システム管理者');
    });
  });
});
