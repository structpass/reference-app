import { Prisma } from '@prisma/client';
import {
  StockWithRelationsResponseDto,
  StockForecastResponseDto,
  ForecastAlert,
  StockExportResponseDto,
} from './dto/stock-response.dto';

export type StockWithRelations = Prisma.StockGetPayload<{
  include: {
    warehouse: { select: { id: true; name: true; code: true } };
    product: {
      select: {
        id: true;
        name: true;
        code: true;
        unit: true;
        category: { select: { id: true; name: true } };
      };
    };
  };
}>;

export type StockWithExportRelations = Prisma.StockGetPayload<{
  include: {
    warehouse: { select: { name: true; code: true } };
    product: {
      select: {
        name: true;
        code: true;
        unit: true;
        category: { select: { name: true } };
      };
    };
  };
}>;

export function toStockWithRelationsResponse(
  entity: StockWithRelations,
): StockWithRelationsResponseDto {
  return {
    id: entity.id,
    warehouseId: entity.warehouseId,
    productId: entity.productId,
    quantity: entity.quantity,
    warehouse: entity.warehouse ?? undefined,
    product: entity.product
      ? {
          id: entity.product.id,
          name: entity.product.name,
          code: entity.product.code,
          unit: entity.product.unit,
          category: entity.product.category ?? undefined,
        }
      : undefined,
  };
}

/** 予測在庫（forecast）計算値。service が算出し、mapper で DTO へ合成する。 */
export interface ForecastQuantities {
  incomingQty: number;
  outgoingQty: number;
  forecastQty: number;
  alert: ForecastAlert;
}

export function toForecastStockResponse(
  entity: StockWithRelations,
  forecast: ForecastQuantities,
): StockForecastResponseDto {
  return {
    id: entity.id,
    warehouseId: entity.warehouseId,
    productId: entity.productId,
    quantity: entity.quantity,
    warehouse: {
      id: entity.warehouse.id,
      name: entity.warehouse.name,
      code: entity.warehouse.code,
    },
    product: {
      id: entity.product.id,
      name: entity.product.name,
      code: entity.product.code,
      unit: entity.product.unit,
      category: entity.product.category,
    },
    incomingQty: forecast.incomingQty,
    outgoingQty: forecast.outgoingQty,
    forecastQty: forecast.forecastQty,
    alert: forecast.alert,
  };
}

export function toStockExportResponse(entity: StockWithExportRelations): StockExportResponseDto {
  return {
    id: entity.id,
    warehouseId: entity.warehouseId,
    productId: entity.productId,
    quantity: entity.quantity,
    warehouse: {
      name: entity.warehouse.name,
      code: entity.warehouse.code,
    },
    product: {
      name: entity.product.name,
      code: entity.product.code,
      unit: entity.product.unit,
      category: entity.product.category ?? undefined,
    },
  };
}

export function toStockWithRelationsListResponse(
  entities: StockWithRelations[],
): StockWithRelationsResponseDto[] {
  return entities.map(toStockWithRelationsResponse);
}

export function toStockExportListResponse(
  entities: StockWithExportRelations[],
): StockExportResponseDto[] {
  return entities.map(toStockExportResponse);
}
