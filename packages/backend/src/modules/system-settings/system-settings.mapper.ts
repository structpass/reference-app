import { Prisma } from '@prisma/client';
import { SystemSettingWithUpdaterResponseDto } from './dto/system-setting-response.dto';

export type SystemSettingWithUpdaterPayload = Prisma.SystemSettingGetPayload<{
  include: { updatedBy: { select: { id: true; name: true } } };
}>;

export function toSystemSettingWithUpdaterResponse(
  entity: SystemSettingWithUpdaterPayload,
): SystemSettingWithUpdaterResponseDto {
  return {
    id: entity.id,
    key: entity.key,
    value: entity.value,
    valueType: entity.valueType,
    label: entity.label,
    description: entity.description,
    category: entity.category,
    sortOrder: entity.sortOrder,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    updatedById: entity.updatedById,
    updatedBy: entity.updatedBy ? { id: entity.updatedBy.id, name: entity.updatedBy.name } : null,
  };
}
