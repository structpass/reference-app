import { OrderStatus } from '@prisma/client';

export interface OrderItemResponseDto {
  id: number;
  orderId: number;
  lineNo: number;
  productId: string;
  orderQty: number;
  unitPrice: number;
  amount: number;
  product?: { id: string; name: string; code: string; unit: string | null };
}

export interface OrderResponseDto {
  id: number;
  orderNo: string;
  orderDate: Date;
  supplierId: number;
  desiredDeliveryDate: Date | null;
  status: OrderStatus;
  totalQty: number | null;
  totalAmount: number | null;
  createdBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: { id: number; name: string; code: string };
  creator?: { id: string; name: string };
  items?: OrderItemResponseDto[];
}
