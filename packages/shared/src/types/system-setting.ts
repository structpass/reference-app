export type SystemSettingValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  valueType: SystemSettingValueType;
  label: string;
  description?: string | null;
  category: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedById?: string | null;
  updatedBy?: { id: string; name: string } | null;
}

export interface PublicConfig {
  [key: string]: string;
}
