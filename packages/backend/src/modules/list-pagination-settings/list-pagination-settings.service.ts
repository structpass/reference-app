import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto';
import { ListPaginationSettingsRepository } from './repositories/list-pagination-settings.repository';
import {
  toTablePaginationSettingResponse,
  toTablePaginationSettingResponseList,
} from './list-pagination-settings.mapper';
import { UpdateTablePaginationSettingDto } from './dto/update-table-pagination-setting.dto';
import { BulkUpdateTablePaginationSettingItemDto } from './dto/bulk-update-table-pagination-settings.dto';

/**
 * 一覧ごとのページサイズ設定の application layer。
 * tableId 検証は controller で完結させ、service は repository を素直に呼ぶ。
 * try/catch は書かず、Prisma エラーは PrismaExceptionFilter に委譲（§4）。
 */
@Injectable()
export class ListPaginationSettingsService {
  constructor(private readonly repo: ListPaginationSettingsRepository) {}

  async findAll() {
    const entities = await this.repo.findAll();
    return ok(toTablePaginationSettingResponseList(entities));
  }

  async findByTableId(tableId: string) {
    const entity = await this.repo.findByTableId(tableId);
    if (!entity) {
      return ok(null);
    }
    return ok(toTablePaginationSettingResponse(entity));
  }

  async update(tableId: string, dto: UpdateTablePaginationSettingDto, userId: string) {
    const entity = await this.repo.patch(tableId, dto, userId);
    return ok(toTablePaginationSettingResponse(entity));
  }

  async bulkUpdate(updates: BulkUpdateTablePaginationSettingItemDto[], userId: string) {
    const entities = await this.repo.bulkUpsert(updates, userId);
    return ok(toTablePaginationSettingResponseList(entities));
  }
}
