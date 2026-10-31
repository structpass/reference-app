import { describe, it, expect } from 'vitest';
import { shipmentSchema } from '@/features/shipments/lib/validations';

describe('shipmentSchema', () => {
  const validLine = { lineNo: 1, productId: 'prod-1', plannedQty: 10 };
  const validData = {
    shipmentDate: '2026-03-16',
    warehouseId: 1,
    destination: '東京配送センター',
    lines: [validLine],
  };

  it('有効なデータはパスすること', () => {
    expect(shipmentSchema.safeParse(validData).success).toBe(true);
  });

  it('出荷日必須', () => {
    expect(shipmentSchema.safeParse({ ...validData, shipmentDate: '' }).success).toBe(false);
  });

  it('倉庫必須', () => {
    expect(shipmentSchema.safeParse({ ...validData, warehouseId: 0 }).success).toBe(false);
  });

  it('出荷先必須', () => {
    expect(shipmentSchema.safeParse({ ...validData, destination: '' }).success).toBe(false);
  });

  it('明細が空配列は拒否', () => {
    expect(shipmentSchema.safeParse({ ...validData, lines: [] }).success).toBe(false);
  });

  it('carrierIdはオプション', () => {
    expect(shipmentSchema.safeParse({ ...validData, carrierId: 1 }).success).toBe(true);
  });
});
