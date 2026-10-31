import type { FieldType } from '@struct-pass/shared';

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
  /**
   * 一覧（findAll・findVisibleForUser）だけが添える項目数（d899）。項目定義そのものを
   * 並べずに数を出せるようにする（画面が台帳ごとに詳細を取りに行かないため）。
   */
  fieldCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
