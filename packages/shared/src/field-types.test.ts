import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from './field-types';
import { PERMISSION_ACTIONS } from './types/permission';
import { TABLE_IDS } from './table-ids';

// d808: 3 つとも「値の一覧」を SSOT として持つが、値そのものを見る試験が無かった。
// 値を増やす時は DB の enum・マイグレーションと揃える決まりで、揃わないと保存時に
// 制約違反になる。ここでは重複・形だけを固定し、増やすこと自体は妨げない。
describe('FIELD_TYPES', () => {
  it('重複が無いこと', () => {
    const values = FIELD_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('値が大文字の識別子で、表示名が空でないこと', () => {
    for (const { value, label } of FIELD_TYPES) {
      expect(value).toMatch(/^[A-Z][A-Z_]*$/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('DB の enum と揃える既定の 5 種を含むこと', () => {
    expect(FIELD_TYPES.map((t) => t.value)).toEqual([
      'TEXT',
      'NUMBER',
      'DATE',
      'SELECT',
      'BOOLEAN',
    ]);
  });
});

describe('PERMISSION_ACTIONS', () => {
  it('4 つの action をこの順で持つこと（画面とガードの SSOT）', () => {
    expect(PERMISSION_ACTIONS).toEqual(['view', 'create', 'update', 'delete']);
  });
});

describe('TABLE_IDS', () => {
  it('重複が無く、FeatureId と同じ形（kebab-case）であること', () => {
    expect(new Set(TABLE_IDS).size).toBe(TABLE_IDS.length);
    expect(TABLE_IDS.every((id) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
  });
});
