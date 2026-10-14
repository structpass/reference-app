import { z } from 'zod';
import type { FieldDefResponse } from './api';

export type CustomRecordFormValue = string | boolean;
export type CustomRecordFormValues = Record<string, CustomRecordFormValue>;

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function requiredMessage(field: FieldDefResponse): string {
  return `${field.label}を入力してください。`;
}

function stringFieldSchema(field: FieldDefResponse) {
  let schema: z.ZodTypeAny = z.string().transform((value) => value.trim());
  if (field.required) {
    schema = schema.refine((value) => value.length > 0, { message: requiredMessage(field) });
  }
  if (field.type === 'DATE') {
    schema = schema.refine((value) => value === '' || isValidCalendarDate(value), {
      message: `${field.label}は有効な日付で入力してください。`,
    });
  }
  return schema.transform((value) => (value === '' ? undefined : value));
}

function numberFieldSchema(field: FieldDefResponse) {
  let schema: z.ZodTypeAny = z.string().transform((value) => value.trim());
  if (field.required) {
    schema = schema.refine((value) => value.length > 0, { message: requiredMessage(field) });
  }
  schema = schema.refine((value) => value === '' || Number.isFinite(Number(value)), {
    message: `${field.label}は数値で入力してください。`,
  });
  return schema.transform((value) => (value === '' ? undefined : Number(value)));
}

/** FieldDefを正本に、フォーム入力をAPI payloadへ変換するZod schemaを生成する。 */
export function buildCustomRecordSchema(fieldDefs: FieldDefResponse[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fieldDefs) {
    if (field.type === 'NUMBER') {
      shape[field.key] = numberFieldSchema(field);
    } else if (field.type === 'BOOLEAN') {
      shape[field.key] = z.boolean();
    } else {
      shape[field.key] = stringFieldSchema(field);
    }
  }
  return z.object(shape).strict();
}

/** レコードの保存値をフォーム表示用の文字列/真偽値へ揃える。 */
export function toCustomRecordFormValues(
  fieldDefs: FieldDefResponse[],
  data: Record<string, unknown> | undefined,
): CustomRecordFormValues {
  const values: CustomRecordFormValues = {};
  for (const field of fieldDefs) {
    const value = data?.[field.key];
    if (field.type === 'BOOLEAN') {
      values[field.key] = value === true;
    } else if (value === null || value === undefined) {
      values[field.key] = '';
    } else {
      values[field.key] = String(value);
    }
  }
  return values;
}

/** Zodのoptional変換結果から未入力の任意項目を除外し、APIへ送るdataを完成させる。 */
export function normalizeCustomRecordData(
  fieldDefs: FieldDefResponse[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fieldDefs) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') continue;
      data[field.key] = trimmed;
      continue;
    }
    data[field.key] = value;
  }
  return data;
}
