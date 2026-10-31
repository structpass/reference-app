import { describe, it, expect } from 'vitest';
import { UserRole } from '@struct-pass/shared';
import { isAdmin, isSysAdmin, canDelete, canCreateMaster, getRoleLabel } from '@/lib/role-utils';

describe('role-utils', () => {
  describe('isAdmin', () => {
    it('ADMIN系ロールはtrueを返すこと', () => {
      expect(isAdmin(UserRole.WH_ADMIN)).toBe(true);
      expect(isAdmin(UserRole.OF_ADMIN)).toBe(true);
      expect(isAdmin(UserRole.SYS_ADMIN)).toBe(true);
    });

    it('USER系ロールはfalseを返すこと', () => {
      expect(isAdmin(UserRole.WH_USER)).toBe(false);
      expect(isAdmin(UserRole.OF_USER)).toBe(false);
    });

    it('null（権限待ち）はfalseを返すこと', () => {
      expect(isAdmin(null)).toBe(false);
    });
  });

  describe('isSysAdmin', () => {
    it('SYS_ADMINのみtrueを返すこと', () => {
      expect(isSysAdmin(UserRole.SYS_ADMIN)).toBe(true);
      expect(isSysAdmin(UserRole.WH_ADMIN)).toBe(false);
      expect(isSysAdmin(UserRole.OF_ADMIN)).toBe(false);
      expect(isSysAdmin(UserRole.WH_USER)).toBe(false);
    });

    it('null（権限待ち）はfalseを返すこと', () => {
      expect(isSysAdmin(null)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('ADMIN系ロールはtrueを返すこと', () => {
      expect(canDelete(UserRole.WH_ADMIN)).toBe(true);
      expect(canDelete(UserRole.SYS_ADMIN)).toBe(true);
    });

    it('USER系ロールはfalseを返すこと', () => {
      expect(canDelete(UserRole.WH_USER)).toBe(false);
    });

    it('null（権限待ち）はfalseを返すこと', () => {
      expect(canDelete(null)).toBe(false);
    });
  });

  describe('canCreateMaster', () => {
    it('ADMIN系ロールはtrueを返すこと', () => {
      expect(canCreateMaster(UserRole.OF_ADMIN)).toBe(true);
    });

    it('USER系ロールはfalseを返すこと', () => {
      expect(canCreateMaster(UserRole.OF_USER)).toBe(false);
    });

    it('null（権限待ち）はfalseを返すこと', () => {
      expect(canCreateMaster(null)).toBe(false);
    });
  });

  describe('getRoleLabel', () => {
    it('全ロールの日本語ラベルを返すこと', () => {
      expect(getRoleLabel(UserRole.WH_USER)).toBe('倉庫担当（一般）');
      expect(getRoleLabel(UserRole.WH_ADMIN)).toBe('倉庫担当（管理者）');
      expect(getRoleLabel(UserRole.OF_USER)).toBe('事務担当（一般）');
      expect(getRoleLabel(UserRole.OF_ADMIN)).toBe('事務担当（管理者）');
      expect(getRoleLabel(UserRole.SYS_ADMIN)).toBe('システム管理者');
    });

    it('null（権限待ち）は「権限待ち」を返すこと', () => {
      expect(getRoleLabel(null)).toBe('権限待ち');
    });
  });
});
