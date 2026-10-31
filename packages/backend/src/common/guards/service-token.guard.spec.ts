import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ServiceTokenGuard } from './service-token.guard';

describe('ServiceTokenGuard (ref-0095)', () => {
  let guard: ServiceTokenGuard;

  const ctx = (headerValue: string | undefined) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-service-token': headerValue } }),
      }),
    }) as unknown as ExecutionContext;

  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    guard = new ServiceTokenGuard();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('正しい credential で true（環境変数設定済み時）', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'correct-token';
    expect(guard.canActivate(ctx('correct-token'))).toBe(true);
  });

  it('credential 無し（ヘッダ無し）→ UnauthorizedException', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'correct-token';
    expect(() => guard.canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });

  it('ユーザー JWT（Authorization Bearer）だけでは通過できない（x-service-token 無し）', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'correct-token';
    const bearerCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer some-user-jwt' },
        }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(bearerCtx)).toThrow(UnauthorizedException);
  });

  it('誤 token → UnauthorizedException', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'correct-token';
    expect(() => guard.canActivate(ctx('wrong-token'))).toThrow(UnauthorizedException);
  });

  it('env 未設定時は正しい token でも拒否（fail-closed・受口無効化）', () => {
    delete process.env.INTEGRATION_SERVICE_TOKEN;
    expect(() => guard.canActivate(ctx('correct-token'))).toThrow(UnauthorizedException);
  });
});
