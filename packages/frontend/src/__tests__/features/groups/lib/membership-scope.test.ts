import { describe, it, expect } from 'vitest';
import { UserRole } from '@struct-pass/shared';
import {
  canOrganizeGroup,
  groupFamilyOf,
  groupScopeDenialMessage,
} from '@/features/groups/lib/membership-scope';

// v2-462: 画面側の編成範囲は backend の
// packages/backend/src/modules/groups/constants/group-membership-scope.ts と
// 同じ表をなぞる（系統違いのグループで追加候補と追加 UI を出さない）。
describe('membership-scope', () => {
  describe('groupFamilyOf', () => {
    it.each([
      [UserRole.WH_USER, 'WH'],
      [UserRole.WH_ADMIN, 'WH'],
      [UserRole.OF_USER, 'OF'],
      [UserRole.OF_ADMIN, 'OF'],
    ])('%s は %s 系統', (role, expected) => {
      expect(groupFamilyOf(role)).toBe(expected);
    });

    it('SYS_ADMIN と role 未取得は系統を決めない', () => {
      expect(groupFamilyOf(UserRole.SYS_ADMIN)).toBeNull();
      expect(groupFamilyOf(null)).toBeNull();
      expect(groupFamilyOf(undefined)).toBeNull();
    });
  });

  describe('canOrganizeGroup — 呼び出し元ロール × 宛先グループの系統', () => {
    it('SYS_ADMIN は全系統を編成できる', () => {
      for (const group of Object.values(UserRole)) {
        expect(canOrganizeGroup(UserRole.SYS_ADMIN, group)).toBe(true);
      }
    });

    it('WH_ADMIN は WH 系統だけを編成できる', () => {
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.WH_USER)).toBe(true);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.WH_ADMIN)).toBe(true);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.OF_USER)).toBe(false);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.OF_ADMIN)).toBe(false);
      // SYS_ADMIN ロールのグループは SYS_ADMIN だけが扱う（backend の assertSysAdminArea と同じ）
      expect(canOrganizeGroup(UserRole.WH_ADMIN, UserRole.SYS_ADMIN)).toBe(false);
    });

    it('OF_ADMIN は OF 系統だけを編成できる', () => {
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.OF_USER)).toBe(true);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.OF_ADMIN)).toBe(true);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.WH_USER)).toBe(false);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.WH_ADMIN)).toBe(false);
      expect(canOrganizeGroup(UserRole.OF_ADMIN, UserRole.SYS_ADMIN)).toBe(false);
    });

    it('一般ユーザーは編成しない', () => {
      for (const caller of [UserRole.WH_USER, UserRole.OF_USER]) {
        for (const group of Object.values(UserRole)) {
          expect(canOrganizeGroup(caller, group)).toBe(false);
        }
      }
    });

    it('呼び出し元またはグループの role が未取得なら編成できない側へ倒す', () => {
      expect(canOrganizeGroup(null, UserRole.WH_USER)).toBe(false);
      expect(canOrganizeGroup(undefined, UserRole.WH_USER)).toBe(false);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, undefined)).toBe(false);
      expect(canOrganizeGroup(UserRole.WH_ADMIN, null)).toBe(false);
    });
  });

  describe('groupScopeDenialMessage', () => {
    it('WH 系統では倉庫担当の管理者を案内する', () => {
      expect(groupScopeDenialMessage(UserRole.WH_USER)).toBe(
        '担当系統の異なるグループは編成できません（このグループは倉庫担当のグループで、倉庫担当の管理者が編成します）。変更が必要な場合はシステム管理者へご依頼ください',
      );
    });

    it('OF 系統では事務担当の管理者を案内する', () => {
      expect(groupScopeDenialMessage(UserRole.OF_ADMIN)).toBe(
        '担当系統の異なるグループは編成できません（このグループは事務担当のグループで、事務担当の管理者が編成します）。変更が必要な場合はシステム管理者へご依頼ください',
      );
    });
  });
});
