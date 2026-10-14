import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGroupDto } from './create-group.dto';

/**
 * v2-445: 作成 DTO は「未指定（undefined）」だけを許し、`null` は入れられない値として弾く。
 *
 * 以前は `status` に `@IsOptional()` が付いており、`null` も「未指定」として検証を素通りして
 * Prisma まで届き、非 null 列（`Group.status`）で `Argument ... must not be null` の
 * 500 INTERNAL_ERROR になっていた（実 API 実測）。ここが緩むと同じ 500 が戻るため、境界
 * （null は不可 / undefined は可 / nullable 列の description だけ null 可）を unit で固定する。
 * 更新 DTO 側の同じ境界は `update-group.dto.spec.ts`（v2-428）が持つ。
 */
describe('CreateGroupDto', () => {
  const validateDto = (body: Record<string, unknown>) =>
    validate(plainToInstance(CreateGroupDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  const base = { code: 'GRP-001', name: '作成テスト', role: 'WH_USER' };

  it('必須項目だけの本文（status 未指定）は検証を通ること', async () => {
    expect(await validateDto(base)).toHaveLength(0);
  });

  it('有効な status を指定した本文は検証を通ること', async () => {
    expect(await validateDto({ ...base, status: 'INACTIVE' })).toHaveLength(0);
  });

  for (const field of ['code', 'name', 'role', 'status']) {
    it(`${field} の null を弾くこと（DB の非 null 列）`, async () => {
      const errors = await validateDto({ ...base, [field]: null });
      expect(errors.map((error) => error.property)).toContain(field);
    });
  }

  it('nullable 列の description の null は通ること', async () => {
    expect(await validateDto({ ...base, description: null })).toHaveLength(0);
  });

  for (const [field, value] of [
    ['code', ''],
    ['name', ''],
    ['role', 'NOT_A_ROLE'],
    ['status', 'NOT_A_STATUS'],
  ] as const) {
    it(`${field} の不正値（${JSON.stringify(value)}）を弾くこと`, async () => {
      const errors = await validateDto({ ...base, [field]: value });
      expect(errors.map((error) => error.property)).toContain(field);
    });
  }
});
