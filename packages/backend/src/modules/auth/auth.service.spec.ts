import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUserEntity } from '@/__tests__/factories';

const mockUser = makeUserEntity({
  id: 'user-uuid-1',
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.OF_USER,
  lastLoginAt: null,
});

const mockUsersService = {
  findById: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('issueJwt', () => {
    it('{ sub, jti } payload で JWT を発行すること（username/role は載せない）', () => {
      mockJwtService.sign.mockReturnValue('jwt-token');

      const token = service.issueJwt({ id: 'user-uuid-1' });

      expect(token).toBe('jwt-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid-1',
        jti: expect.any(String),
      });
    });

    it('発行毎に異なる jti を採番すること', () => {
      mockJwtService.sign.mockReturnValue('jwt-token');

      service.issueJwt({ id: 'user-uuid-1' });
      service.issueJwt({ id: 'user-uuid-1' });

      const firstJti = mockJwtService.sign.mock.calls[0][0].jti;
      const secondJti = mockJwtService.sign.mock.calls[1][0].jti;
      expect(firstJti).not.toBe(secondJti);
    });
  });

  describe('getProfile', () => {
    it('ユーザープロフィールを返すこと（passwordHash/username 非含有）', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-uuid-1');

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(result).not.toHaveProperty('username');
    });

    it('ユーザーが見つからない場合にUnauthorizedExceptionをスローすること', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(UnauthorizedException);
    });
  });
});
