import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  const ctx = (): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, cookies: {} }),
        getResponse: () => ({}),
      }),
      getType: () => 'http',
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('ガードが定義されていること', () => {
    expect(guard).toBeDefined();
  });

  it('@Public() が付いている場合は passport を経由せず素通しすること', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    // 素通しなら同期的に true が返る（super.canActivate に進まない）
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('IS_PUBLIC_KEY を Reflector の getAllAndOverride で問い合わせること', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    guard.canActivate(ctx());
    expect(spy).toHaveBeenCalledWith('is-public', expect.any(Array));
  });
});
