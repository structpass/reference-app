import type { Supplier } from '@prisma/client';
import { makeBase, BASE_DATE } from './_base';

export const makeSupplierEntity = makeBase<Supplier>({
  id: 1,
  code: 'S-001',
  name: '仕入先A',
  address: '大阪市中央区',
  phone: '06-0000-0000',
  contactPerson: '佐藤次郎',
  email: 'supplier-a@example.com',
  status: 'ACTIVE',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
});
