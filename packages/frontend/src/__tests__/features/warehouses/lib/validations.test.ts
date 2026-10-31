import { describe, it, expect } from 'vitest';
import { warehouseSchema } from '@/features/warehouses/lib/validations';

describe('warehouseSchema', () => {
  const validData = { code: 'WH-001', name: '倉庫A', status: 'ACTIVE' as const };

  it('有効なデータはパスすること', () => {
    expect(warehouseSchema.safeParse(validData).success).toBe(true);
  });

  it('コード必須', () => {
    expect(warehouseSchema.safeParse({ ...validData, code: '' }).success).toBe(false);
  });

  it('名前必須', () => {
    expect(warehouseSchema.safeParse({ ...validData, name: '' }).success).toBe(false);
  });

  it('capacityは0以上の整数', () => {
    expect(warehouseSchema.safeParse({ ...validData, capacity: 100 }).success).toBe(true);
    expect(warehouseSchema.safeParse({ ...validData, capacity: -1 }).success).toBe(false);
  });
});
