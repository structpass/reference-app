import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

/**
 * mock オブジェクトは beforeEach で毎回再生成する（resetMocks/restoreMocks は jest.fn() の関数そのもの
 * を含む状態＝呼び出し履歴・戻り値実装を剥がすが、module-scope で束ねた参照まで剥がすとは限らないため、
 * 「参照を新しい jest.fn() で貼り直す」のが安全＝ref-0045）。
 */
let mockConfigService: { get: jest.Mock; getOrThrow: jest.Mock } = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};
let mockUsersService: { findById: jest.Mock } = { findById: jest.fn() };
let mockTokenDenylistService: { isRevoked: jest.Mock } = { isRevoked: jest.fn() };

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    // resetMocks/restoreMocks により jest.fn() 自体も毎テスト剥がれるため mock 関数を再生成し、
    // constructor の前に secretOrKey を返す実装を差し込む（ref-0045＝cmn-0215 の横展開）。
    mockConfigService.get = jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });
    mockConfigService.getOrThrow = jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      throw new Error(`Missing required env var: ${key}`);
    });
    mockUsersService.findById = jest.fn();
    mockTokenDenylistService.isRevoked = jest.fn().mockResolvedValue(false);

    strategy = new JwtStrategy(
      mockConfigService as any,
      mockUsersService as any,
      mockTokenDenylistService as any,
    );
  });

  it('strategyが定義されていること', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    // SSO 化で payload は { sub, jti } のみ。role/name は DB から都度引き直す。
    it('有効なペイロードでユーザー情報を返すこと', async () => {
      const mockUser = {
        id: 'uuid-1',
        name: 'admin',
        email: 'admin@test.com',
        role: 'SYS_ADMIN',
        isActive: true,
      };
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await strategy.validate({ sub: 'uuid-1', jti: 'valid-jti-1' });

      expect(result).toEqual({
        id: 'uuid-1',
        name: 'admin',
        email: 'admin@test.com',
        role: 'SYS_ADMIN',
      });
      expect(mockUsersService.findById).toHaveBeenCalledWith('uuid-1');
    });

    it('ユーザーが見つからない場合にUnauthorizedExceptionをスローすること', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(strategy.validate({ sub: 'non-existent', jti: 'some-jti' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('非アクティブユーザーの場合にUnauthorizedExceptionをスローすること', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid-1',
        name: 'inactive',
        isActive: false,
      });

      await expect(strategy.validate({ sub: 'uuid-1', jti: 'some-jti' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('jtiがdenylistでrevokedの場合、UnauthorizedExceptionをスローすること', async () => {
      mockTokenDenylistService.isRevoked.mockResolvedValue(true);

      await expect(strategy.validate({ sub: 'uuid-1', jti: 'revoked-jti' })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockTokenDenylistService.isRevoked).toHaveBeenCalledWith('revoked-jti');
      expect(mockUsersService.findById).not.toHaveBeenCalled();
    });

    it('jtiがdenylistでrevokedでない場合、正常にユーザー情報を返すこと', async () => {
      mockTokenDenylistService.isRevoked.mockResolvedValue(false);
      mockUsersService.findById.mockResolvedValue({
        id: 'uuid-1',
        name: 'admin',
        email: 'admin@test.com',
        role: 'SYS_ADMIN',
        isActive: true,
      });

      const result = await strategy.validate({ sub: 'uuid-1', jti: 'valid-jti' });

      expect(mockTokenDenylistService.isRevoked).toHaveBeenCalledWith('valid-jti');
      expect(result).toEqual({
        id: 'uuid-1',
        name: 'admin',
        email: 'admin@test.com',
        role: 'SYS_ADMIN',
      });
    });

    it('jtiが存在しないペイロードの場合、UnauthorizedExceptionをスローすること', async () => {
      await expect(strategy.validate({ sub: 'uuid-1', jti: '' })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockTokenDenylistService.isRevoked).not.toHaveBeenCalled();
      expect(mockUsersService.findById).not.toHaveBeenCalled();
    });
  });
});
