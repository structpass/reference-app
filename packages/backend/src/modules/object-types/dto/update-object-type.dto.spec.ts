import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateObjectTypeDto } from './update-object-type.dto';

describe('UpdateObjectTypeDto', () => {
  const valid = {
    name: '仕入先評価',
    fieldDefs: [{ key: 'name', label: '仕入先名', type: 'TEXT', required: true }],
  };

  it.each([
    ['省略', valid],
    ['null', { ...valid, icon: null }],
    ['sortOrder=0', { ...valid, sortOrder: 0 }],
  ])('icon/sortOrder の有効な境界を受け入れる: %s', async (_label, payload) => {
    await expect(validate(plainToInstance(UpdateObjectTypeDto, payload))).resolves.toEqual([]);
  });

  it('fieldDefs keyを検証する', async () => {
    const dto = plainToInstance(UpdateObjectTypeDto, {
      ...valid,
      fieldDefs: [{ key: 'invalid-key', label: '項目', type: 'TEXT' }],
    });
    const errors = await validate(dto);

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'fieldDefs',
        children: [expect.objectContaining({ children: expect.any(Array) })],
      }),
    ]);
  });

  it('nameと1件以上のfieldDefsを必須にする', async () => {
    const errors = await validate(plainToInstance(UpdateObjectTypeDto, { fieldDefs: [] }));
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'fieldDefs']),
    );
  });
});
