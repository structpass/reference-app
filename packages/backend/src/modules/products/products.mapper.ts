import { Prisma } from '@prisma/client';
import { decimalToNumber, decimalToNumberNullable } from '../../common/helpers';
import { ProductResponseDto } from './dto/product-response.dto';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: { select: { id: true; code: true; name: true } };
    creator: { select: { id: true; name: true } };
    updater: { select: { id: true; name: true } };
  };
}>;

export type ProductWithCreator = Prisma.ProductGetPayload<{
  include: {
    category: { select: { id: true; code: true; name: true } };
    creator: { select: { id: true; name: true } };
  };
}>;

export function toProductResponse(
  entity: ProductWithRelations | ProductWithCreator,
): ProductResponseDto {
  const hasUpdater = 'updater' in entity;
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description,
    categoryId: entity.categoryId,
    category: entity.category ?? undefined,
    price: decimalToNumber(entity.price),
    purchasePrice: decimalToNumberNullable(entity.purchasePrice),
    unit: entity.unit,
    stockQuantity: entity.stockQuantity,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    creator: entity.creator ?? undefined,
    updater: hasUpdater ? (entity.updater ?? null) : undefined,
  };
}

export function toProductListResponse(entities: ProductWithRelations[]): ProductResponseDto[] {
  return entities.map(toProductResponse);
}
