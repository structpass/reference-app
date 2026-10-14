import { ObjectType, FieldDef, CustomRecord } from '@prisma/client';
import {
  ObjectTypeResponseDto,
  FieldDefResponseDto,
  CustomRecordResponseDto,
} from './dto/object-type-response.dto';

/** FieldDef 単体をレスポンス DTO へ変換する（ref-0076・sortOrder は repository 側で整列済み）。 */
export function toFieldDefResponse(entity: FieldDef): FieldDefResponseDto {
  return {
    id: entity.id,
    objectTypeId: entity.objectTypeId,
    key: entity.key,
    label: entity.label,
    type: entity.type,
    required: entity.required,
    sortOrder: entity.sortOrder,
  };
}

export function toObjectTypeResponse(
  entity: ObjectType & { fieldDefs?: FieldDef[] },
): ObjectTypeResponseDto {
  const base: ObjectTypeResponseDto = {
    id: entity.id,
    key: entity.key,
    name: entity.name,
    icon: entity.icon,
    sortOrder: entity.sortOrder,
    isPreset: entity.isPreset,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
  if (entity.fieldDefs) {
    base.fieldDefs = entity.fieldDefs.map(toFieldDefResponse);
  }
  return base;
}

/** CustomRecord エンティティをレスポンス DTO へ変換する（ref-0076・DTO 境界。data は Json 型）。 */
export function toCustomRecordResponse(entity: CustomRecord): CustomRecordResponseDto {
  return {
    id: entity.id,
    objectTypeId: entity.objectTypeId,
    data: entity.data as Record<string, unknown>,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
