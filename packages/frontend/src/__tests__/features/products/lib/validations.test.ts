import { describe, it, expect } from 'vitest';
import { productSchema } from '@/features/products';
import { ProductStatus } from '@struct-pass/shared';

describe('productSchema', () => {
  const validProduct = {
    code: 'PRD-001',
    name: 'テスト商品',
    categoryId: 1,
    price: 1000,
    status: ProductStatus.ACTIVE,
  };

  it('validates a valid product', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('requires code', () => {
    const result = productSchema.safeParse({ ...validProduct, code: '' });
    expect(result.success).toBe(false);
  });

  it('requires name', () => {
    const result = productSchema.safeParse({ ...validProduct, name: '' });
    expect(result.success).toBe(false);
  });

  it('requires categoryId', () => {
    const result = productSchema.safeParse({ ...validProduct, categoryId: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = productSchema.safeParse({ ...validProduct, price: -1 });
    expect(result.success).toBe(false);
  });

  it('allows optional description', () => {
    const result = productSchema.safeParse({ ...validProduct, description: 'テスト説明' });
    expect(result.success).toBe(true);
  });

  it('allows empty string description', () => {
    const result = productSchema.safeParse({ ...validProduct, description: '' });
    expect(result.success).toBe(true);
  });
});
