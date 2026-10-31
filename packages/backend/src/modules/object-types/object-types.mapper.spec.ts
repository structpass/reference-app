import { toObjectTypeResponse } from './object-types.mapper';
import { makeObjectTypeEntity } from '@/__tests__/factories';
import type { FieldDef, FieldType } from '@prisma/client';

describe('toObjectTypeResponse', () => {
  it('ObjectType entity の全フィールドを ObjectTypeResponseDto へマッピングする', () => {
    const entity = makeObjectTypeEntity({
      id: 1,
      key: 'product',
      name: '商品',
      icon: 'package',
      sortOrder: 1,
      isPreset: true,
    });

    const result = toObjectTypeResponse(entity);

    expect(result).toEqual({
      id: entity.id,
      key: entity.key,
      name: entity.name,
      icon: entity.icon,
      sortOrder: entity.sortOrder,
      isPreset: entity.isPreset,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  });

  it('icon が null の場合も null のまま渡す', () => {
    const entity = makeObjectTypeEntity({ icon: null });

    const result = toObjectTypeResponse(entity);

    expect(result.icon).toBeNull();
  });

  it('fieldDefs が無い一覧由来 entity では fieldDefs を含めない（criteria【5】・ref-0076）', () => {
    const entity = makeObjectTypeEntity({ key: 'product' });

    const result = toObjectTypeResponse(entity);

    expect(result.fieldDefs).toBeUndefined();
  });

  it('fieldDefs があれば並び順どおりに FieldDefResponseDto へ変換する（ref-0076）', () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    const fieldDef = (f: {
      id: number;
      key: string;
      label: string;
      type: FieldType;
      required: boolean;
      sortOrder: number;
    }): FieldDef => ({
      ...f,
      objectTypeId: 10,
      createdAt: now,
      updatedAt: now,
    });
    const entity = {
      ...makeObjectTypeEntity({ key: 'project', isPreset: false }),
      fieldDefs: [
        fieldDef({
          id: 1,
          key: 'code',
          label: 'コード',
          type: 'TEXT',
          required: true,
          sortOrder: 2,
        }),
        fieldDef({
          id: 2,
          key: 'name',
          label: '名前',
          type: 'NUMBER',
          required: false,
          sortOrder: 1,
        }),
      ],
    };

    const result = toObjectTypeResponse(entity);

    expect(result.fieldDefs).toEqual([
      expect.objectContaining({
        key: 'code',
        label: 'コード',
        type: 'TEXT',
        required: true,
        sortOrder: 2,
      }),
      expect.objectContaining({
        key: 'name',
        label: '名前',
        type: 'NUMBER',
        required: false,
        sortOrder: 1,
      }),
    ]);
  });
});
