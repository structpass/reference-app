import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateGroupDto } from './update-group.dto';

/**
 * v2-428: 更新 DTO は「未指定（undefined）」だけを許し、`null` は入れられない値として弾く。
 *
 * 以前は `PartialType(CreateGroupDto)` が全項目へ `@IsOptional()` を付けるため `null` が検証を
 * 素通りし、Prisma まで届いて `Argument ... must not be null` の 500 INTERNAL_ERROR になっていた
 * （実 API 実測）。ここが緩むと同じ 500 が戻るため、境界（null は不可 / undefined は可 /
 * nullable 列の description だけ null 可）を unit で固定する。
 */
describe('UpdateGroupDto', () => {
  const validateDto = (body: Record<string, unknown>) =>
    validate(plainToInstance(UpdateGroupDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('未指定（空オブジェクト）は検証を通ること', async () => {
    expect(await validateDto({})).toHaveLength(0);
  });

  it('指定された項目だけを検証し、未指定の項目は飛ばすこと', async () => {
    expect(await validateDto({ name: '更新名' })).toHaveLength(0);
    expect(await validateDto({ role: 'WH_USER' })).toHaveLength(0);
  });

  for (const field of ['code', 'name', 'role', 'status']) {
    it(`${field} の null を弾くこと（DB の非 null 列）`, async () => {
      const errors = await validateDto({ [field]: null });
      expect(errors.map((error) => error.property)).toContain(field);
    });
  }

  it('nullable 列の description の null は通ること（説明のクリア）', async () => {
    expect(await validateDto({ description: null })).toHaveLength(0);
  });

  for (const [field, value] of [
    ['code', ''],
    ['name', ''],
    ['role', 'NOT_A_ROLE'],
    ['status', 'NOT_A_STATUS'],
  ] as const) {
    it(`${field} の不正値（${JSON.stringify(value)}）を弾くこと`, async () => {
      const errors = await validateDto({ [field]: value });
      expect(errors.map((error) => error.property)).toContain(field);
    });
  }
});
