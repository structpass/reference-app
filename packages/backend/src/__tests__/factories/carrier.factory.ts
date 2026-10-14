import type { Carrier } from '@prisma/client';
import { makeBase, BASE_DATE } from './_base';

export const makeCarrierEntity = makeBase<Carrier>({
  id: 1,
  code: 'C-001',
  name: 'ヤマト運輸',
  address: '東京都中央区',
  phone: '03-0000-0000',
  contactPerson: '山田太郎',
  email: 'yamato@example.com',
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});
