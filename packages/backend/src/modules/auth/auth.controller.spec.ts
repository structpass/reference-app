import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { TokenDenylistService } from './services/token-denylist.service';
import { Response, Request } from 'express';

// login は SSO 化で撤去。残るは logout（jti revocation）と me（getProfile）。
const mockAuthService = {
  getProfile: jest.fn(),
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockTokenDenylistService = {
  revoke: jest.fn(),
  isRevoked: jest.fn(),
};

const mockResponse = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

const mockRequest = {
  cookies: {},
  headers: {},
} as unknown as Request;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: TokenDenylistService, useValue: mockTokenDenylistService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);

    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('logout', () => {
    it('ログアウト成功メッセージを返すこと', async () => {
      const result = await controller.logout(mockRequest, mockResponse);

      expect(result).toEqual({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    });

    it('トークンにjtiとexpがある場合、tokenDenylistService.revokeが呼ばれること', async () => {
      const reqWithCookie = {
        cookies: { sp_access_token: 'some-token' },
        headers: {},
      } as unknown as Request;
      mockJwtService.verify.mockReturnValue({ jti: 'test-jti', exp: 1711929600 });
      mockTokenDenylistService.revoke.mockResolvedValue(undefined);

      await controller.logout(reqWithCookie, mockResponse);

      expect(mockJwtService.verify).toHaveBeenCalledWith('some-token');
      expect(mockTokenDenylistService.revoke).toHaveBeenCalledWith(
        'test-jti',
        new Date(1711929600 * 1000),
      );
    });

    it('トークンの検証に失敗しても、clearCookieが呼ばれること', async () => {
      const reqWithCookie = {
        cookies: { sp_access_token: 'invalid-token' },
        headers: {},
      } as unknown as Request;
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await controller.logout(reqWithCookie, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'sp_access_token',
        expect.objectContaining({ path: '/', httpOnly: true }),
      );
    });

    it('res.clearCookieがsp_access_tokenキーで呼ばれること', async () => {
      await controller.logout(mockRequest, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'sp_access_token',
        expect.objectContaining({ path: '/', httpOnly: true }),
      );
    });

    it('Cookie内にトークンがない場合でも正常にレスポンスを返すこと', async () => {
      const emptyReq = {
        cookies: {},
        headers: {},
      } as unknown as Request;

      const result = await controller.logout(emptyReq, mockResponse);

      expect(result).toEqual({
        success: true,
        data: { message: 'Logged out successfully' },
      });
      expect(mockTokenDenylistService.revoke).not.toHaveBeenCalled();
    });
  });

  describe('getProfile (me)', () => {
    it('ユーザープロフィールを返すこと', async () => {
      const profile = {
        id: 'user-1',
        name: 'testuser',
        email: 'test@example.com',
        role: 'OF_USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockAuthService.getProfile.mockResolvedValue(profile);

      const result = await controller.getProfile('user-1');

      expect(result).toEqual({ success: true, data: profile });
      expect(mockAuthService.getProfile).toHaveBeenCalledWith('user-1');
    });

    it('AuthServiceがスローした例外がそのまま伝播すること', async () => {
      mockAuthService.getProfile.mockRejectedValue(new Error('User not found'));

      await expect(controller.getProfile('bad-id')).rejects.toThrow('User not found');
    });
  });
});
