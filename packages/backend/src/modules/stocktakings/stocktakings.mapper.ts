import { Prisma } from '@prisma/client';
import {
  StocktakingResponseDto,
  StocktakingWithRelationsResponseDto,
  StocktakingItemResponseDto,
} from './dto/stocktaking-response.dto';

export type StocktakingWithRelations = Prisma.StocktakingGetPayload<{
  include: {
    warehouse: { select: { id: true; name: true; code: true } };
    creator: { select: { id: true; name: true } };
    items: {
      include: { product: { select: { id: true; name: true; code: true; unit: true } } };
    };
  };
}>;

/** include なし（base scalar fields のみ）の Stocktaking entity。export 用。 */
export type StocktakingScalar = Prisma.StocktakingGetPayload<Record<string, never>>;

function toStocktakingItemResponse(
  item: StocktakingWithRelations['items'][number],
): StocktakingItemResponseDto {
  return {
    id: item.id,
    stocktakingId: item.stocktakingId,
    productId: item.productId,
    theoreticalQty: item.theoreticalQty,
    actualQty: item.actualQty,
    difference: item.difference,
    differenceReason: item.differenceReason,
    product: item.product ?? undefined,
  };
}

export function toStocktakingResponse(
  entity: StocktakingWithRelations,
): StocktakingWithRelationsResponseDto {
  return {
    id: entity.id,
    stocktakingDate: entity.stocktakingDate,
    warehouseId: entity.warehouseId,
    stocktaker: entity.stocktaker,
    status: entity.status,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    warehouse: entity.warehouse ?? undefined,
    creator: entity.creator ?? undefined,
    items: entity.items?.map(toStocktakingItemResponse),
  };
}

export function toStocktakingListResponse(
  entities: StocktakingWithRelations[],
): StocktakingWithRelationsResponseDto[] {
  return entities.map(toStocktakingResponse);
}

/**
 * include なしの base entity を export 用の `StocktakingResponseDto` に変換する。
 * 他 export 系メソッド（stocks の toStockExportResponse 等）と同様に mapper を経由し、
 * `unknown as Dto[]` のキャスト迂回を避ける（CODE-M3 / architecture-invariants §1）。
 */
export function toStocktakingExportResponse(entity: StocktakingScalar): StocktakingResponseDto {
  return {
    id: entity.id,
    stocktakingDate: entity.stocktakingDate,
    warehouseId: entity.warehouseId,
    stocktaker: entity.stocktaker,
    status: entity.status,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toStocktakingExportListResponse(
  entities: StocktakingScalar[],
): StocktakingResponseDto[] {
  return entities.map(toStocktakingExportResponse);
}
