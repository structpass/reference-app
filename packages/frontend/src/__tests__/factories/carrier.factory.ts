import { type Carrier, ActiveStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeCarrier = makeBase<Carrier>({
  id: 1,
  code: 'CR-001',
  name: 'テスト運送',
  address: '東京都...',
  phone: '03-1111-1111',
  contactPerson: '佐藤',
  email: 'sato@carrier.example.com',
  status: ActiveStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
