import { type Warehouse, ActiveStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeWarehouse = makeBase<Warehouse>({
  id: 1,
  code: 'WH-001',
  name: '東京倉庫',
  address: '東京都千代田区...',
  phone: '03-0000-0000',
  manager: '田中',
  capacity: 1000,
  status: ActiveStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
