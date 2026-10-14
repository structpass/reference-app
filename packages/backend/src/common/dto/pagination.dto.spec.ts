import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

function createDto(data: Partial<PaginationDto>): PaginationDto {
  return plainToInstance(PaginationDto, data);
}

describe('PaginationDto', () => {
  it('order: ascで通過すること', async () => {
    const dto = createDto({ order: 'asc' });
    const errors = await validate(dto);
    const orderError = errors.find((e) => e.property === 'order');
    expect(orderError).toBeUndefined();
  });

  it('order: descで通過すること', async () => {
    const dto = createDto({ order: 'desc' });
    const errors = await validate(dto);
    const orderError = errors.find((e) => e.property === 'order');
    expect(orderError).toBeUndefined();
  });

  it('order: "DROP TABLE"でバリデーションエラーになること', async () => {
    const dto = createDto({ order: 'DROP TABLE' as any });
    const errors = await validate(dto);
    const orderError = errors.find((e) => e.property === 'order');
    expect(orderError).toBeDefined();
  });

  it('order未指定時のデフォルトがdescであること', () => {
    const dto = createDto({});
    expect(dto.order).toBe('desc');
  });
});
