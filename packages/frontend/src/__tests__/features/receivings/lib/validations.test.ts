import { describe, it, expect } from 'vitest';
import { receivingSchema } from '@/features/receivings/lib/validations';

describe('receivingSchema', () => {
  const validLine = { lineNo: 1, productId: 'prod-1', plannedQty: 10 };
  const validData = {
    receivingDate: '2026-03-16',
    warehouseId: 1,
    supplierId: 1,
    lines: [validLine],
  };

  it('有効なデータはパスすること', () => {
    expect(receivingSchema.safeParse(validData).success).toBe(true);
  });

  it('入荷日必須', () => {
    expect(receivingSchema.safeParse({ ...validData, receivingDate: '' }).success).toBe(false);
  });

  it('倉庫必須', () => {
    expect(receivingSchema.safeParse({ ...validData, warehouseId: 0 }).success).toBe(false);
  });

  it('仕入先必須', () => {
    expect(receivingSchema.safeParse({ ...validData, supplierId: 0 }).success).toBe(false);
  });

  it('明細が空配列は拒否', () => {
    expect(receivingSchema.safeParse({ ...validData, lines: [] }).success).toBe(false);
  });

  it('予定数量は1以上', () => {
    const lines = [{ ...validLine, plannedQty: 0 }];
    expect(receivingSchema.safeParse({ ...validData, lines }).success).toBe(false);
  });

  it('実績数量はオプション', () => {
    const lines = [{ ...validLine, actualQty: 8 }];
    expect(receivingSchema.safeParse({ ...validData, lines }).success).toBe(true);
  });
});
