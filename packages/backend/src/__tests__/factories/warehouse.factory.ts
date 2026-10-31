import type { Warehouse } from '@prisma/client';
import { makeBase, BASE_DATE } from './_base';

export const makeWarehouseEntity = makeBase<Warehouse>({
  id: 1,
  code: 'W-001',
  name: '東京倉庫',
  address: '東京都江東区',
  phone: '03-1111-1111',
  manager: '管理者A',
  capacity: 1000,
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});
