import { FieldType } from '@prisma/client';

export interface FieldDefResponseDto {
  id: number;
  objectTypeId: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
}

/** 自由定義データ 1 件（ref-0076・findRecords の返り。Prisma CustomRecord の生返しをしない DTO 境界）。 */
export interface CustomRecordResponseDto {
  id: number;
  objectTypeId: number;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObjectTypeResponseDto {
  id: number;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isPreset: boolean;
  /** ref-0076: findByKey のみ項目定義を並び順どおりに含める（一覧は含めない＝criteria【5】）。 */
  fieldDefs?: FieldDefResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
