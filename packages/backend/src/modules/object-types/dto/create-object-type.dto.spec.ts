import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateObjectTypeDto } from './create-object-type.dto';

describe('CreateObjectTypeDto', () => {
  const validPayload = {
    key: 'supplier-score',
    name: '仕入先評価',
    icon: 'clipboard-check',
    sortOrder: 6,
    fieldDefs: [
      { key: 'name', label: '仕入先名', type: 'TEXT', required: true },
      { key: 'reviewedOn', label: '評価日', type: 'DATE' },
    ],
  };

  it('有効な台帳定義を受け入れる', async () => {
    const dto = plainToInstance(CreateObjectTypeDto, validPayload);

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('ObjectType key の非kebab-caseと空の項目定義を拒否する', async () => {
    const dto = plainToInstance(CreateObjectTypeDto, {
      ...validPayload,
      key: 'Supplier Score',
      fieldDefs: [],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['key', 'fieldDefs']),
    );
  });

  it('nested FieldDef の非lower camel case keyと未知の型を拒否する', async () => {
    const dto = plainToInstance(CreateObjectTypeDto, {
      ...validPayload,
      fieldDefs: [{ key: 'reviewed-on', label: '評価日', type: 'UNKNOWN' }],
    });

    const errors = await validate(dto);

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'fieldDefs',
        children: [
          expect.objectContaining({
            children: expect.arrayContaining([
              expect.objectContaining({ property: 'key' }),
              expect.objectContaining({ property: 'type' }),
            ]),
          }),
        ],
      }),
    ]);
  });
});
