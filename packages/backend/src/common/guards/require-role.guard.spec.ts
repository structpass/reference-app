import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequireRoleGuard } from './require-role.guard';

describe('RequireRoleGuard', () => {
  let reflector: Reflector;
  let guard: RequireRoleGuard;

  const ctx = (user: { role: UserRole } | undefined) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  // require-role.guard は 2 つの key を Reflector に問い合わせる。
  // - 'is-public': @Public() 短絡判定
  // - 'require-role': allowlist 本体
  const setMeta = (opts: { isPublic?: boolean; roles?: UserRole[] }) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'is-public') return opts.isPublic;
      if (key === 'require-role') return opts.roles;
      return undefined;
    });
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RequireRoleGuard(reflector);
  });

  it('metadata が無ければ素通し（role 要求なし endpoint）', () => {
    setMeta({});
    expect(guard.canActivate(ctx({ role: UserRole.WH_USER }))).toBe(true);
  });

  it('@Public() 付きなら req.user が無くても短絡で true', () => {
    setMeta({ isPublic: true, roles: [UserRole.SYS_ADMIN] });
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('user が undefined なら fail-closed', () => {
    setMeta({ roles: [UserRole.SYS_ADMIN] });
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('role が一致すれば true', () => {
    setMeta({ roles: [UserRole.SYS_ADMIN] });
    expect(guard.canActivate(ctx({ role: UserRole.SYS_ADMIN }))).toBe(true);
  });

  it('role が一致しなければ ForbiddenException', () => {
    setMeta({ roles: [UserRole.SYS_ADMIN] });
    expect(() => guard.canActivate(ctx({ role: UserRole.WH_USER }))).toThrow(ForbiddenException);
  });

  it('複数 role 指定でいずれか一致すれば true', () => {
    setMeta({ roles: [UserRole.SYS_ADMIN, UserRole.WH_ADMIN] });
    expect(guard.canActivate(ctx({ role: UserRole.WH_ADMIN }))).toBe(true);
  });
});
