import { Prisma } from '@prisma/client';
import {
  ShipmentResponseDto,
  ShipmentWithRelationsResponseDto,
  ShipmentLineResponseDto,
} from './dto/shipment-response.dto';

export type ShipmentWithRelations = Prisma.ShipmentGetPayload<{
  include: {
    warehouse: { select: { id: true; name: true; code: true } };
    carrier: { select: { id: true; name: true; code: true } };
    creator: { select: { id: true; name: true } };
    lines: {
      include: { product: { select: { id: true; name: true; code: true; unit: true } } };
      orderBy: { lineNo: 'asc' };
    };
  };
}>;

function toShipmentLineResponse(
  line: ShipmentWithRelations['lines'][number],
): ShipmentLineResponseDto {
  return {
    id: line.id,
    lineNo: line.lineNo,
    productId: line.productId,
    plannedQty: line.plannedQty,
    actualQty: line.actualQty,
    product: line.product ?? undefined,
  };
}

export function toShipmentResponse(
  entity: ShipmentWithRelations,
): ShipmentWithRelationsResponseDto {
  return {
    id: entity.id,
    shipmentNo: entity.shipmentNo,
    shipmentDate: entity.shipmentDate,
    warehouseId: entity.warehouseId,
    destination: entity.destination,
    carrierId: entity.carrierId,
    status: entity.status,
    createdBy: entity.createdBy,
    deletedAt: entity.deletedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    warehouse: entity.warehouse ?? undefined,
    carrier: entity.carrier ?? null,
    creator: entity.creator ?? undefined,
    lines: entity.lines?.map(toShipmentLineResponse),
  };
}

export function toShipmentListResponse(
  entities: ShipmentWithRelations[],
): ShipmentWithRelationsResponseDto[] {
  return entities.map(toShipmentResponse);
}

/** include なし（base scalar fields のみ）の Shipment entity。export 用。 */
export type ShipmentScalar = Prisma.ShipmentGetPayload<Record<string, never>>;

/**
 * include なしの base entity を export 用の `ShipmentResponseDto` に変換する。
 * stocktakings の toStocktakingExportResponse と同様に mapper を経由し、
 * `unknown as Dto[]` のキャスト迂回を避ける（CODE-M3 / architecture-invariants §1）。
 */
export function toShipmentExportResponse(entity: ShipmentScalar): ShipmentResponseDto {
  return {
    id: entity.id,
    shipmentNo: entity.shipmentNo,
    shipmentDate: entity.shipmentDate,
    warehouseId: entity.warehouseId,
    destination: entity.destination,
    carrierId: entity.carrierId,
    status: entity.status,
    createdBy: entity.createdBy,
    deletedAt: entity.deletedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toShipmentExportListResponse(entities: ShipmentScalar[]): ShipmentResponseDto[] {
  return entities.map(toShipmentExportResponse);
}
