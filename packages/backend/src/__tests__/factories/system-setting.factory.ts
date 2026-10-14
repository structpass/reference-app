import type { SystemSettingWithUpdaterPayload } from '../../modules/system-settings/system-settings.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeSystemSettingEntity = makeBase<SystemSettingWithUpdaterPayload>({
  id: 'setting-1',
  key: 'company.name',
  value: 'StructPass株式会社',
  valueType: 'STRING',
  label: '会社名',
  description: 'システム上に表示される会社名',
  category: 'branding',
  sortOrder: 0,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  updatedById: 'user-1',
  updatedBy: { id: 'user-1', name: 'admin' },
} as unknown as SystemSettingWithUpdaterPayload);
