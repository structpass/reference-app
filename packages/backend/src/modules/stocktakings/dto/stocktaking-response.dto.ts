import { StocktakingStatus } from '@prisma/client';

export interface StocktakingItemResponseDto {
  id: number;
  stocktakingId: number;
  productId: string;
  theoreticalQty: number;
  actualQty: number | null;
  difference: number | null;
  differenceReason: string | null;
  product?: { id: string; name: string; code: string; unit: string | null };
}

export interface StocktakingResponseDto {
  id: number;
  stocktakingDate: Date;
  warehouseId: number;
  stocktaker: string | null;
  status: StocktakingStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StocktakingWithRelationsResponseDto extends StocktakingResponseDto {
  warehouse?: { id: number; name: string; code: string };
  creator?: { id: string; name: string };
  items?: StocktakingItemResponseDto[];
}
