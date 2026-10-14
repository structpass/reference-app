import type { StocktakingWithRelations } from '../../modules/stocktakings/stocktakings.mapper';
import { makeBase, BASE_DATE } from './_base';

type StocktakingItem = StocktakingWithRelations['items'][number];

export const makeStocktakingItemEntity = makeBase<StocktakingItem>({
  id: 300,
  stocktakingId: 1,
  productId: 'prod-1',
  theoreticalQty: 100,
  actualQty: 98,
  difference: -2,
  differenceReason: '破損',
  product: { id: 'prod-1', name: '商品A', code: 'P-001', unit: '個' },
} as StocktakingItem);

export const makeStocktakingEntity = makeBase<StocktakingWithRelations>({
  id: 1,
  stocktakingDate: BASE_DATE,
  warehouseId: 10,
  stocktaker: '山田太郎',
  status: 'DRAFT',
  createdBy: 'user-1',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  warehouse: { id: 10, name: '本社倉庫', code: 'WH-001' },
  creator: { id: 'user-1', name: 'admin' },
  items: [makeStocktakingItemEntity()],
} as StocktakingWithRelations);
