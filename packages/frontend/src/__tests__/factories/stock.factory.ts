import { type Stock, type StockWithRelations } from '@struct-pass/shared';
import { makeBase } from './_base';

export const makeStock = makeBase<Stock>({
  id: 1,
  warehouseId: 1,
  productId: 'prod-1',
  quantity: 50,
});

export const makeStockWithRelations = makeBase<StockWithRelations>({
  id: 1,
  warehouseId: 1,
  productId: 'prod-1',
  quantity: 50,
  warehouse: { id: 1, name: '東京倉庫', code: 'WH-001' },
  product: {
    id: 'prod-1',
    name: 'テスト商品',
    code: 'P-001',
    category: { id: 1, name: 'カテゴリーA' },
    unit: '個',
  },
});
