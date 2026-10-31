import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TokenDenylistRepository } from '../repositories/token-denylist.repository';

@Injectable()
export class TokenDenylistService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tokenDenylistRepository: TokenDenylistRepository) {}

  onModuleInit() {
    // 1時間ごとに期限切れトークンを削除
    this.cleanupTimer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.tokenDenylistRepository.upsertRevoked(jti, expiresAt);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const token = await this.tokenDenylistRepository.findByJti(jti);
    return token !== null;
  }

  async cleanup(): Promise<number> {
    const result = await this.tokenDenylistRepository.deleteExpired(new Date());
    return result.count;
  }
}
