import { ReceivingStatus } from '@prisma/client';

export interface ReceivingLineResponseDto {
  id: number;
  lineNo: number;
  productId: string;
  plannedQty: number;
  actualQty: number | null;
  product?: { id: string; name: string; code: string; unit: string | null };
}

export interface ReceivingResponseDto {
  id: number;
  receivingNo: string;
  receivingDate: Date;
  warehouseId: number;
  supplierId: number;
  status: ReceivingStatus;
  createdBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceivingWithRelationsResponseDto extends ReceivingResponseDto {
  warehouse?: { id: number; name: string; code: string };
  supplier?: { id: number; name: string; code: string };
  creator?: { id: string; name: string };
  lines?: ReceivingLineResponseDto[];
}
