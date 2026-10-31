import { ProductStatus } from '@prisma/client';

/**
 * Product レスポンス DTO。Prisma Entity を API 層の型に変換した形。
 * Decimal は number に、relation は浅い project で返す。
 */
export interface ProductResponseDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: number;
  category?: { id: number; code: string; name: string };
  price: number;
  purchasePrice: number | null;
  unit: string | null;
  stockQuantity: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  creator?: { id: string; name: string };
  updater?: { id: string; name: string } | null;
}
