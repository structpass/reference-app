export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description?: string;
  categoryId: number;
  category?: { id: number; code: string; name: string };
  price: number;
  purchasePrice?: number | null;
  unit?: string | null;
  stockQuantity: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface CreateProductDto {
  code: string;
  name: string;
  description?: string;
  categoryId: number;
  price: number;
  purchasePrice?: number;
  unit?: string;
  stockQuantity?: number;
  status?: ProductStatus;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}
