import { Prisma } from '@prisma/client';
import {
  ReceivingWithRelationsResponseDto,
  ReceivingLineResponseDto,
} from './dto/receiving-response.dto';

export type ReceivingWithRelations = Prisma.ReceivingGetPayload<{
  include: {
    warehouse: { select: { id: true; name: true; code: true } };
    supplier: { select: { id: true; name: true; code: true } };
    creator: { select: { id: true; name: true } };
    lines: {
      include: { product: { select: { id: true; name: true; code: true; unit: true } } };
      orderBy: { lineNo: 'asc' };
    };
  };
}>;

function toReceivingLineResponse(
  line: ReceivingWithRelations['lines'][number],
): ReceivingLineResponseDto {
  return {
    id: line.id,
    lineNo: line.lineNo,
    productId: line.productId,
    plannedQty: line.plannedQty,
    actualQty: line.actualQty,
    product: line.product ?? undefined,
  };
}

export function toReceivingResponse(
  entity: ReceivingWithRelations,
): ReceivingWithRelationsResponseDto {
  return {
    id: entity.id,
    receivingNo: entity.receivingNo,
    receivingDate: entity.receivingDate,
    warehouseId: entity.warehouseId,
    supplierId: entity.supplierId,
    status: entity.status,
    createdBy: entity.createdBy,
    deletedAt: entity.deletedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    warehouse: entity.warehouse ?? undefined,
    supplier: entity.supplier ?? undefined,
    creator: entity.creator ?? undefined,
    lines: entity.lines?.map(toReceivingLineResponse),
  };
}

export function toReceivingListResponse(
  entities: ReceivingWithRelations[],
): ReceivingWithRelationsResponseDto[] {
  return entities.map(toReceivingResponse);
}
