export interface SystemSettingResponseDto {
  id: string;
  key: string;
  value: string;
  valueType: string;
  label: string;
  description: string | null;
  category: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
}

export interface SystemSettingUpdaterDto {
  id: string;
  name: string;
}

export interface SystemSettingWithUpdaterResponseDto extends SystemSettingResponseDto {
  updatedBy: SystemSettingUpdaterDto | null;
}
