import { describe, expect, it } from 'vitest';
import type { FieldDefResponse } from './api';
import {
  buildCustomRecordSchema,
  normalizeCustomRecordData,
  toCustomRecordFormValues,
} from './custom-record-schema';

const fieldDefs: FieldDefResponse[] = [
  {
    id: 1,
    objectTypeId: 1,
    key: 'name',
    label: '名称',
    type: 'TEXT',
    required: true,
    sortOrder: 0,
  },
  {
    id: 2,
    objectTypeId: 1,
    key: 'score',
    label: '点数',
    type: 'NUMBER',
    required: false,
    sortOrder: 1,
  },
  {
    id: 3,
    objectTypeId: 1,
    key: 'reviewedOn',
    label: '評価日',
    type: 'DATE',
    required: true,
    sortOrder: 2,
  },
  {
    id: 4,
    objectTypeId: 1,
    key: 'status',
    label: '状態',
    type: 'SELECT',
    required: false,
    sortOrder: 3,
  },
  {
    id: 5,
    objectTypeId: 1,
    key: 'active',
    label: '有効',
    type: 'BOOLEAN',
    required: false,
    sortOrder: 4,
  },
];

describe('custom-record-schema', () => {
  it('FieldDefごとにAPI向けの型へ正規化し、任意の空値を省略する', () => {
    const result = buildCustomRecordSchema(fieldDefs).safeParse({
      name: '  仕入先A  ',
      score: '80.5',
      reviewedOn: '2026-08-28',
      status: '',
      active: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      name: '仕入先A',
      score: 80.5,
      reviewedOn: '2026-08-28',
      status: undefined,
      active: true,
    });
    expect(normalizeCustomRecordData(fieldDefs, result.data)).toEqual({
      name: '仕入先A',
      score: 80.5,
      reviewedOn: '2026-08-28',
      active: true,
    });
  });

  it('必須値・数値・日付の入力エラーを返す', () => {
    const result = buildCustomRecordSchema(fieldDefs).safeParse({
      name: ' ',
      score: 'not-a-number',
      reviewedOn: '2026-02-30',
      status: '',
      active: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['name', 'score', 'reviewedOn']),
    );
  });

  it('保存データをフォーム表示値へ変換する', () => {
    expect(
      toCustomRecordFormValues(fieldDefs, {
        name: '仕入先A',
        score: 80,
        reviewedOn: '2026-08-28',
        active: false,
      }),
    ).toEqual({
      name: '仕入先A',
      score: '80',
      reviewedOn: '2026-08-28',
      status: '',
      active: false,
    });
  });

  it('DATE は実在する日付だけを通す（うるう年 2024/2000 は可、2023/1900 の 2/29 は不可）', () => {
    const dateFields: FieldDefResponse[] = [
      {
        id: 1,
        objectTypeId: 1,
        key: 'dueDate',
        label: '納期',
        type: 'DATE',
        required: false,
        sortOrder: 0,
      },
    ];
    const schema = buildCustomRecordSchema(dateFields);

    expect(schema.parse({ dueDate: '2024-02-29' })).toEqual({ dueDate: '2024-02-29' });
    expect(schema.parse({ dueDate: '2000-02-29' })).toEqual({ dueDate: '2000-02-29' });
    expect(schema.parse({ dueDate: '' })).toEqual({ dueDate: undefined });

    for (const value of ['2023-02-29', '1900-02-29', '2026-13-01', '2026-04-31', '2026-1-1']) {
      const result = schema.safeParse({ dueDate: value });
      expect(result.success, `${value} は弾かれる`).toBe(false);
      if (result.success) continue;
      expect(result.error.issues[0]?.message).toBe('納期は有効な日付で入力してください。');
    }
  });

  it('NUMBER の空欄は未入力として扱い、必須 NUMBER の空欄はエラーにする', () => {
    const optionalNumber: FieldDefResponse[] = [
      {
        id: 1,
        objectTypeId: 1,
        key: 'score',
        label: '点数',
        type: 'NUMBER',
        required: false,
        sortOrder: 0,
      },
    ];
    expect(buildCustomRecordSchema(optionalNumber).parse({ score: '' })).toEqual({
      score: undefined,
    });

    const requiredNumber: FieldDefResponse[] = [{ ...optionalNumber[0], required: true }];
    const result = buildCustomRecordSchema(requiredNumber).safeParse({ score: '  ' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toEqual(['点数を入力してください。']);
  });

  it('保存値が空白だけの文字列は payload から落とす', () => {
    expect(
      normalizeCustomRecordData(fieldDefs, { name: '仕入先A', status: '   ', active: true }),
    ).toEqual({ name: '仕入先A', active: true });
  });
});
