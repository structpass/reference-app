import { TablePaginationSettingResponseDto } from './dto/table-pagination-setting-response.dto';
import type { TablePaginationSettingWithUpdater } from './repositories/list-pagination-settings.repository';

/**
 * TablePaginationSetting Entity → Response DTO 変換（include: updatedBy 前提）。
 * Date は ISO 文字列化。
 */
export function toTablePaginationSettingResponse(
  entity: TablePaginationSettingWithUpdater,
): TablePaginationSettingResponseDto {
  return {
    tableId: entity.tableId,
    defaultPageSize: entity.defaultPageSize,
    pageSizeOptions: entity.pageSizeOptions,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    updatedById: entity.updatedById,
    updatedBy: entity.updatedBy,
  };
}

export function toTablePaginationSettingResponseList(
  entities: TablePaginationSettingWithUpdater[],
): TablePaginationSettingResponseDto[] {
  return entities.map(toTablePaginationSettingResponse);
}
