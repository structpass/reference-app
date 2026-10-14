import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomRecordDto } from './create-custom-record.dto';

describe('CreateCustomRecordDto', () => {
  it('data が非 null オブジェクトなら受け入れる', async () => {
    const dto = plainToInstance(CreateCustomRecordDto, {
      data: { name: '仕入先01', rating: 80 },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('data が null や配列、プリミティブなら拒否する', async () => {
    const dto = plainToInstance(CreateCustomRecordDto, { data: null });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('data');
  });
});
