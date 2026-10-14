import { describe, it, expect } from 'vitest';
import { stocktakingSchema, stocktakingItemSchema } from '@/features/stocktakings/lib/validations';

describe('stocktakingSchema', () => {
  const validItem = { productId: 'prod-1', theoreticalQty: 100, actualQty: 95 };
  const validData = {
    stocktakingDate: '2026-03-16',
    warehouseId: 1,
    items: [validItem],
  };

  it('有効なデータはパスすること', () => {
    expect(stocktakingSchema.safeParse(validData).success).toBe(true);
  });

  it('棚卸日必須', () => {
    expect(stocktakingSchema.safeParse({ ...validData, stocktakingDate: '' }).success).toBe(false);
  });

  it('倉庫必須', () => {
    expect(stocktakingSchema.safeParse({ ...validData, warehouseId: 0 }).success).toBe(false);
  });

  it('明細が空配列は拒否', () => {
    expect(stocktakingSchema.safeParse({ ...validData, items: [] }).success).toBe(false);
  });

  it('stocktakerはオプション', () => {
    expect(stocktakingSchema.safeParse({ ...validData, stocktaker: '担当者A' }).success).toBe(true);
  });
});

describe('stocktakingItemSchema', () => {
  it('actualQtyはオプション', () => {
    expect(
      stocktakingItemSchema.safeParse({ productId: 'prod-1', theoreticalQty: 100 }).success,
    ).toBe(true);
  });

  it('theoreticalQtyは0以上', () => {
    expect(
      stocktakingItemSchema.safeParse({ productId: 'prod-1', theoreticalQty: -1 }).success,
    ).toBe(false);
  });

  it('商品は必須', () => {
    expect(stocktakingItemSchema.safeParse({ productId: '', theoreticalQty: 100 }).success).toBe(
      false,
    );
  });
});
