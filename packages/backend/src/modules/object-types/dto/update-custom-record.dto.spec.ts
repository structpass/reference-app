import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomRecordDto } from './update-custom-record.dto';

describe('UpdateCustomRecordDto', () => {
  it('data が非 null オブジェクトなら受け入れる（完全置換）', async () => {
    const dto = plainToInstance(UpdateCustomRecordDto, {
      data: { name: '更新後', rating: 85 },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('data が null なら拒否する', async () => {
    const dto = plainToInstance(UpdateCustomRecordDto, { data: null });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('data');
  });
});
