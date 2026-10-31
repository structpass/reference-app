import { type Supplier, ActiveStatus } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeSupplier = makeBase<Supplier>({
  id: 1,
  code: 'SP-001',
  name: 'テスト仕入先',
  address: '大阪府...',
  phone: '06-2222-2222',
  contactPerson: '鈴木',
  email: 'suzuki@supplier.example.com',
  status: ActiveStatus.ACTIVE,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});
