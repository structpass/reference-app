import { Injectable } from '@nestjs/common';
import { RevokedToken } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class TokenDenylistRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertRevoked(jti: string, expiresAt: Date): Promise<RevokedToken> {
    return this.prisma.revokedToken.upsert({
      where: { jti },
      update: {},
      create: { jti, expiresAt },
    });
  }

  findByJti(jti: string): Promise<RevokedToken | null> {
    return this.prisma.revokedToken.findUnique({ where: { jti } });
  }

  deleteExpired(before: Date): Promise<{ count: number }> {
    return this.prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: before } },
    });
  }
}
