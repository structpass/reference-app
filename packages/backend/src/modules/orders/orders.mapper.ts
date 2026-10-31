import { Prisma } from '@prisma/client';
import { decimalToNumber, decimalToNumberNullable } from '../../common/helpers';
import { OrderResponseDto, OrderItemResponseDto } from './dto/order-response.dto';

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    supplier: { select: { id: true; name: true; code: true } };
    creator: { select: { id: true; name: true } };
    items: {
      include: {
        product: { select: { id: true; name: true; code: true; unit: true } };
      };
    };
  };
}>;

export type OrderItemWithProduct = Prisma.OrderItemGetPayload<{
  include: {
    product: { select: { id: true; name: true; code: true; unit: true } };
  };
}>;

export function toOrderItemResponse(item: OrderItemWithProduct): OrderItemResponseDto {
  return {
    id: item.id,
    orderId: item.orderId,
    lineNo: item.lineNo,
    productId: item.productId,
    orderQty: item.orderQty,
    unitPrice: decimalToNumber(item.unitPrice),
    amount: decimalToNumber(item.amount),
    product: item.product ?? undefined,
  };
}

export function toOrderResponse(entity: OrderWithRelations): OrderResponseDto {
  return {
    id: entity.id,
    orderNo: entity.orderNo,
    orderDate: entity.orderDate,
    supplierId: entity.supplierId,
    desiredDeliveryDate: entity.desiredDeliveryDate,
    status: entity.status,
    totalQty: entity.totalQty,
    totalAmount: decimalToNumberNullable(entity.totalAmount),
    createdBy: entity.createdBy,
    deletedAt: entity.deletedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    supplier: entity.supplier ?? undefined,
    creator: entity.creator ?? undefined,
    items: entity.items?.map(toOrderItemResponse),
  };
}

export function toOrderListResponse(entities: OrderWithRelations[]): OrderResponseDto[] {
  return entities.map(toOrderResponse);
}
