import { ShipmentStatus } from '@prisma/client';

export interface ShipmentLineResponseDto {
  id: number;
  lineNo: number;
  productId: string;
  plannedQty: number;
  actualQty: number | null;
  product?: { id: string; name: string; code: string; unit: string | null };
}

export interface ShipmentResponseDto {
  id: number;
  shipmentNo: string;
  shipmentDate: Date;
  warehouseId: number;
  destination: string;
  carrierId: number | null;
  status: ShipmentStatus;
  createdBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentWithRelationsResponseDto extends ShipmentResponseDto {
  warehouse?: { id: number; name: string; code: string };
  carrier?: { id: number; name: string; code: string } | null;
  creator?: { id: string; name: string };
  lines?: ShipmentLineResponseDto[];
}
