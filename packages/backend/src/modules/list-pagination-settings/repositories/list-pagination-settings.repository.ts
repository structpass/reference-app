import { Injectable } from '@nestjs/common';
import { Prisma, TablePaginationSetting } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * TablePaginationSetting データアクセス層（architecture-invariants §2）。
 * Service は Prisma を直接呼ばず、本 repository 経由でのみ DB に触る。
 */
export type TablePaginationSettingWithUpdater = TablePaginationSetting & {
  updatedBy: { id: string; name: string } | null;
};

const updatedByInclude = {
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.TablePaginationSettingInclude;

@Injectable()
export class ListPaginationSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<TablePaginationSettingWithUpdater[]> {
    return this.prisma.tablePaginationSetting.findMany({
      include: updatedByInclude,
      orderBy: { tableId: 'asc' },
    });
  }

  findByTableId(tableId: string): Promise<TablePaginationSettingWithUpdater | null> {
    return this.prisma.tablePaginationSetting.findUnique({
      where: { tableId },
      include: updatedByInclude,
    });
  }

  upsert(
    tableId: string,
    defaultPageSize: number,
    pageSizeOptions: string,
    userId: string | null,
  ): Promise<TablePaginationSettingWithUpdater> {
    return this.prisma.tablePaginationSetting.upsert({
      where: { tableId },
      create: { tableId, defaultPageSize, pageSizeOptions, updatedById: userId },
      update: { defaultPageSize, pageSizeOptions, updatedById: userId },
      include: updatedByInclude,
    });
  }

  patch(
    tableId: string,
    data: { defaultPageSize?: number; pageSizeOptions?: string },
    userId: string | null,
  ): Promise<TablePaginationSettingWithUpdater> {
    return this.prisma.tablePaginationSetting.update({
      where: { tableId },
      data: { ...data, updatedById: userId },
      include: updatedByInclude,
    });
  }

  bulkUpsert(
    items: Array<{ tableId: string; defaultPageSize: number; pageSizeOptions: string }>,
    userId: string | null,
  ): Promise<TablePaginationSettingWithUpdater[]> {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.tablePaginationSetting.upsert({
          where: { tableId: item.tableId },
          create: { ...item, updatedById: userId },
          update: {
            defaultPageSize: item.defaultPageSize,
            pageSizeOptions: item.pageSizeOptions,
            updatedById: userId,
          },
          include: updatedByInclude,
        }),
      ),
    );
  }
}
