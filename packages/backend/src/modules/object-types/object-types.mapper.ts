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

/**
 * 台帳（種別）をレスポンス DTO へ変換する。
 * 項目定義（fieldDefs）を渡された時だけそれを並べ、一覧（項目数だけを数えた行）では
 * fieldCount として数を添える（d899・一覧が項目定義を並べない規則は変えない）。
 */
export function toObjectTypeResponse(
  entity: ObjectType & { fieldDefs?: FieldDef[]; _count?: { fieldDefs: number } },
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
  if (entity._count) {
    base.fieldCount = entity._count.fieldDefs;
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
