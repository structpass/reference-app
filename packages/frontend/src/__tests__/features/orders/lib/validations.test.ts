import { describe, it, expect } from 'vitest';
import { orderSchema } from '@/features/orders/lib/validations';

describe('orderSchema', () => {
  const validItem = { lineNo: 1, productId: 'prod-1', orderQty: 10, unitPrice: 500 };
  const validData = {
    orderDate: '2026-03-16',
    supplierId: 1,
    items: [validItem],
  };

  it('有効なデータはパスすること', () => {
    expect(orderSchema.safeParse(validData).success).toBe(true);
  });

  it('発注日必須', () => {
    expect(orderSchema.safeParse({ ...validData, orderDate: '' }).success).toBe(false);
  });

  it('仕入先必須', () => {
    expect(orderSchema.safeParse({ ...validData, supplierId: 0 }).success).toBe(false);
  });

  it('明細が空配列は拒否', () => {
    expect(orderSchema.safeParse({ ...validData, items: [] }).success).toBe(false);
  });

  it('発注数量は1以上', () => {
    const items = [{ ...validItem, orderQty: 0 }];
    expect(orderSchema.safeParse({ ...validData, items }).success).toBe(false);
  });

  it('単価は0以上', () => {
    const items = [{ ...validItem, unitPrice: -1 }];
    expect(orderSchema.safeParse({ ...validData, items }).success).toBe(false);
  });

  it('desiredDeliveryDateはオプション', () => {
    expect(orderSchema.safeParse({ ...validData, desiredDeliveryDate: '2026-04-01' }).success).toBe(
      true,
    );
  });
});
