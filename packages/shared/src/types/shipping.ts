export enum ReceivingStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
}

export interface Receiving {
  id: number;
  receivingNo: string;
  receivingDate: string;
  warehouseId: number;
  supplierId: number;
  supplier?: { id: number; name: string; code: string };
  status: ReceivingStatus;
  createdBy: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivingLine {
  id: number;
  receivingId: number;
  lineNo: number;
  productId: string;
  plannedQty: number;
  actualQty?: number | null;
}

export enum ShipmentStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
}

export interface Shipment {
  id: number;
  shipmentNo: string;
  shipmentDate: string;
  warehouseId: number;
  destination: string;
  carrierId?: number | null;
  status: ShipmentStatus;
  createdBy: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentLine {
  id: number;
  shipmentId: number;
  lineNo: number;
  productId: string;
  plannedQty: number;
  actualQty?: number | null;
}

export interface ShippingRecord {
  type: 'RECEIVING' | 'SHIPMENT';
  id: number;
  documentNo: string;
  date: string;
  warehouseName: string;
  counterparty: string;
  status: string;
  createdAt: string;
}
