import { Test, TestingModule } from '@nestjs/testing';
import { TokenDenylistService } from './token-denylist.service';
import { TokenDenylistRepository } from '../repositories/token-denylist.repository';

const mockTokenDenylistRepository = {
  upsertRevoked: jest.fn(),
  findByJti: jest.fn(),
  deleteExpired: jest.fn(),
};

describe('TokenDenylistService', () => {
  let service: TokenDenylistService;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenDenylistService,
        { provide: TokenDenylistRepository, useValue: mockTokenDenylistRepository },
      ],
    }).compile();

    service = module.get<TokenDenylistService>(TokenDenylistService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('revoke', () => {
    it('jtiとexpiresAtでRevokedTokenをupsertすること', async () => {
      const jti = 'test-jti-123';
      const expiresAt = new Date('2026-04-01');
      mockTokenDenylistRepository.upsertRevoked.mockResolvedValue({});

      await service.revoke(jti, expiresAt);

      expect(mockTokenDenylistRepository.upsertRevoked).toHaveBeenCalledWith(jti, expiresAt);
    });

    it('同一jtiで2回呼ばれてもエラーにならないこと（冪等性）', async () => {
      const jti = 'duplicate-jti';
      const expiresAt = new Date('2026-04-01');
      mockTokenDenylistRepository.upsertRevoked.mockResolvedValue({});

      await service.revoke(jti, expiresAt);
      await service.revoke(jti, expiresAt);

      expect(mockTokenDenylistRepository.upsertRevoked).toHaveBeenCalledTimes(2);
    });
  });

  describe('isRevoked', () => {
    it('存在するjtiに対してtrueを返すこと', async () => {
      mockTokenDenylistRepository.findByJti.mockResolvedValue({
        jti: 'revoked-jti',
        expiresAt: new Date(),
        revokedAt: new Date(),
      });

      const result = await service.isRevoked('revoked-jti');

      expect(result).toBe(true);
      expect(mockTokenDenylistRepository.findByJti).toHaveBeenCalledWith('revoked-jti');
    });

    it('存在しないjtiに対してfalseを返すこと', async () => {
      mockTokenDenylistRepository.findByJti.mockResolvedValue(null);

      const result = await service.isRevoked('unknown-jti');

      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('期限切れトークンのみ削除すること', async () => {
      mockTokenDenylistRepository.deleteExpired.mockResolvedValue({ count: 3 });

      const now = new Date('2026-03-31T12:00:00Z');
      jest.setSystemTime(now);

      const count = await service.cleanup();

      expect(count).toBe(3);
      expect(mockTokenDenylistRepository.deleteExpired).toHaveBeenCalledWith(now);
    });
  });

  describe('lifecycle', () => {
    it('onModuleInitでcleanupTimerがセットされること', () => {
      service.onModuleInit();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('onModuleDestroyでcleanupTimerがクリアされること', () => {
      service.onModuleInit();
      expect(jest.getTimerCount()).toBe(1);

      service.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('1時間ごとにcleanupが実行されること', async () => {
      mockTokenDenylistRepository.deleteExpired.mockResolvedValue({ count: 0 });

      service.onModuleInit();

      jest.advanceTimersByTime(60 * 60 * 1000);

      expect(mockTokenDenylistRepository.deleteExpired).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60 * 60 * 1000);

      expect(mockTokenDenylistRepository.deleteExpired).toHaveBeenCalledTimes(2);
    });
  });
});
