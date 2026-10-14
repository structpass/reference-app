import { type Stocktaking, type StocktakingItem, StocktakingStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeStocktaking = makeBase<Stocktaking>({
  id: 1,
  stocktakingDate: BASE_DATE_ISO,
  warehouseId: 1,
  stocktaker: '田中',
  status: StocktakingStatus.DRAFT,
  createdBy: 'user-1',
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});

export const makeStocktakingItem = makeBase<StocktakingItem>({
  id: 1,
  stocktakingId: 1,
  productId: 'prod-1',
  theoreticalQty: 50,
  actualQty: 50,
  difference: 0,
  differenceReason: null,
});
