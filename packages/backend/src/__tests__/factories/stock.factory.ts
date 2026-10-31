import type {
  StockWithRelations,
  StockWithExportRelations,
} from '../../modules/stocks/stocks.mapper';
import { makeBase } from './_base';

export const makeStockWithRelationsEntity = makeBase<StockWithRelations>({
  id: 1,
  warehouseId: 10,
  productId: 'P-001',
  quantity: 100,
  warehouse: { id: 10, name: '東京倉庫', code: 'W-001' },
  product: {
    id: 'P-001',
    name: 'コンデンサ',
    code: 'P-001',
    unit: 'pcs',
    category: { id: 5, name: '電子部品' },
  },
} as unknown as StockWithRelations);

export const makeStockWithExportRelationsEntity = makeBase<StockWithExportRelations>({
  id: 1,
  warehouseId: 10,
  productId: 'P-001',
  quantity: 100,
  warehouse: { name: '東京倉庫', code: 'W-001' },
  product: {
    name: 'コンデンサ',
    code: 'P-001',
    unit: 'pcs',
    category: { name: '電子部品' },
  },
} as unknown as StockWithExportRelations);
