export enum OrderStatus {
  DRAFT = 'DRAFT',
  ORDERED = 'ORDERED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  COMPLETED = 'COMPLETED',
}

export interface Order {
  id: number;
  orderNo: string;
  orderDate: string;
  supplierId: number;
  supplier?: { id: number; name: string; code: string };
  desiredDeliveryDate?: string | null;
  status: OrderStatus;
  totalQty?: number | null;
  totalAmount?: number | null;
  createdBy: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  lineNo: number;
  productId: string;
  orderQty: number;
  unitPrice: number;
  amount: number;
}
