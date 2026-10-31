import { Injectable } from '@nestjs/common';
import { SystemSetting } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { SystemSettingWithUpdaterPayload } from '../system-settings.mapper';

const UPDATED_BY_INCLUDE = {
  updatedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SystemSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllWithUpdater(): Promise<SystemSettingWithUpdaterPayload[]> {
    return this.prisma.systemSetting.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: UPDATED_BY_INCLUDE,
    });
  }

  findAllForCache(): Promise<SystemSetting[]> {
    return this.prisma.systemSetting.findMany();
  }

  findByKey(key: string): Promise<SystemSettingWithUpdaterPayload | null> {
    return this.prisma.systemSetting.findUnique({
      where: { key },
      include: UPDATED_BY_INCLUDE,
    });
  }

  findByKeyBare(key: string): Promise<SystemSetting | null> {
    return this.prisma.systemSetting.findUnique({ where: { key } });
  }

  findByKeys(keys: string[]): Promise<SystemSetting[]> {
    return this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
  }

  updateByKey(
    key: string,
    value: string,
    userId: string,
  ): Promise<SystemSettingWithUpdaterPayload> {
    return this.prisma.systemSetting.update({
      where: { key },
      data: {
        value,
        updatedBy: { connect: { id: userId } },
      },
      include: UPDATED_BY_INCLUDE,
    });
  }

  /**
   * find + update を同一 interactive transaction 内で完結させる。
   * validate コールバックは findByKeys 結果（tx 内での fresh 状態）を受け取り、
   * NotFound / バリデーションエラーをスローする責務を持つ（Service 側に注入）。
   */
  async bulkUpdateAtomic(
    updates: Array<{ key: string; value: string }>,
    userId: string,
    validate: (existing: SystemSetting[]) => void,
  ): Promise<SystemSettingWithUpdaterPayload[]> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.systemSetting.findMany({
        where: { key: { in: updates.map((u) => u.key) } },
      });
      validate(existing);
      const results: SystemSettingWithUpdaterPayload[] = [];
      for (const u of updates) {
        const updated = await tx.systemSetting.update({
          where: { key: u.key },
          data: {
            value: u.value,
            updatedBy: { connect: { id: userId } },
          },
          include: UPDATED_BY_INCLUDE,
        });
        results.push(updated);
      }
      return results;
    });
  }
}
