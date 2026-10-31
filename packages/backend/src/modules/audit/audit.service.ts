import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditRepository } from './repositories/audit.repository';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async log(params: {
    userId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  }) {
    try {
      // 監査ログ失敗はビジネス処理を止めない（fire-and-forget）—
      // PrismaExceptionFilter への引き上げは不可（HTTPレスポンスチェーン外）
      await this.auditRepository.create(params);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`);
    }
  }
}
