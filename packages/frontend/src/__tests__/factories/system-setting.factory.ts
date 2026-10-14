import { type SystemSetting } from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeSystemSetting = makeBase<SystemSetting>({
  id: 'setting-1',
  key: 'app.name',
  value: 'Struct Pass',
  valueType: 'STRING',
  label: 'アプリ名',
  description: '画面に表示されるアプリ名',
  category: 'branding',
  sortOrder: 1,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
  updatedById: 'user-1',
  updatedBy: { id: 'user-1', name: 'tanaka' },
});
