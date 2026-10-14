import { BadRequestException } from '@nestjs/common';
import { FieldType } from '@prisma/client';

/**
 * CustomRecord の data を FieldDef を正本に動的検証する（ref-0098）。
 *
 * FieldDef は DB（実行時）に存在するため、DTO の静的 validator では表現できない。
 * 本ヘルパーは Service 層から persist 済み FieldDef を渡され、未知キー・必須欠落・
 * 型不一致（FieldType ごとの値型）を BadRequestException で拒否する。
 *
 * 既知の制約（design-reviewer 指摘・criteria【DATE/SELECT の制約】）:
 *   - DATE は 'YYYY-MM-DD' 形式の string のみ受ける（seed と同形式・object-types.ts:92）
 *   - SELECT は string を受ける（FieldDef に options/selectOptions 列が無く選択肢検証は行わない）
 *   - NUMBER は finite number（整数/小数を区別しない = design 方針）
 */

/** DATE の 'YYYY-MM-DD' 形式照合。実在日かは isValidCalendarDate で判定する。 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface FieldDefShape {
  key: string;
  type: FieldType;
  required: boolean;
}

/**
 * data を FieldDef 正本で検証する。
 * @param fieldDefs 対象 ObjectType の persist 済み FieldDef（key/type/required を参照）
 * @param data 検証対象の data オブジェクト
 * @throws BadRequestException 未知キー / 必須欠落 / 型不一致のいずれか
 */
export function validateCustomRecordData(
  fieldDefs: FieldDefShape[],
  data: Record<string, unknown>,
): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BadRequestException('data must be a non-null object');
  }

  const defByKey = new Map(fieldDefs.map((field) => [field.key, field]));

  // 必須欠落（required field が data に無い or null）
  for (const def of fieldDefs) {
    if (def.required && (data[def.key] === undefined || data[def.key] === null)) {
      throw new BadRequestException(`Missing required field '${def.key}'`);
    }
  }

  // 未知キー（FieldDef に存在しないキー）
  for (const key of Object.keys(data)) {
    if (!defByKey.has(key)) {
      throw new BadRequestException(`Unknown field '${key}'`);
    }
  }

  // 型不一致（FieldType ごとの値型）
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue; // null は必須欠落側で検出済み
    const def = defByKey.get(key);
    if (!def) continue; // 未知キー側で検出済み
    if (!isTypeMatch(def.type, value)) {
      throw new BadRequestException(
        `Field '${key}' must be of type ${def.type} (got ${typeof value})`,
      );
    }
  }
}

/** 'YYYY-MM-DD' が実在する暦日か（月 01-12・日はその月の実在日数・閏年対応）。 */
export function isValidCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = [
    31, // Jan
    isLeapYear(year) ? 29 : 28, // Feb
    31, // Mar
    30, // Apr
    31, // May
    30, // Jun
    31, // Jul
    31, // Aug
    30, // Sep
    31, // Oct
    30, // Nov
    31, // Dec
  ];
  return day >= 1 && day <= daysInMonth[month - 1];
}

/** 閏年判定（Gregorian: 4 で割れる・100 で割れない or 400 で割れる）。 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** FieldType ごとの値型照合。 */
function isTypeMatch(type: FieldType, value: unknown): boolean {
  switch (type) {
    case 'TEXT':
      return typeof value === 'string';
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'DATE':
      return typeof value === 'string' && DATE_PATTERN.test(value) && isValidCalendarDate(value);
    case 'SELECT':
      return typeof value === 'string';
    case 'BOOLEAN':
      return typeof value === 'boolean';
    default:
      return false;
  }
}
