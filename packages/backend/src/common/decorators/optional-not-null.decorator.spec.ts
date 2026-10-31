import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OptionalNotNull } from './optional-not-null.decorator';
import { IsString, IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';

/**
 * v2-456: `OptionalNotNull`（= `@ValidateIf` で undefined だけ許す）の境界を固定する。
 *
 * `@IsOptional()` は `null` と `undefined` の**両方**で検証を飛ばすため、JSON の明示 `null` が
 * service → repository → Prisma まで届き、DB の非 null 列で 500 INTERNAL_ERROR になっていた。
 * ここが `@IsOptional()` へ戻ると同じ 500 が戻るため、「null は不可 / undefined は可 /
 * nullable 列の null は可」の3つの境界を unit で固定する。
 */
class SampleDto {
  @OptionalNotNull()
  @IsString()
  @IsNotEmpty()
  requiredColumn?: string;

  @IsString()
  @IsOptional()
  nullableColumn?: string | null;
}

describe('OptionalNotNull', () => {
  const validateDto = (body: Record<string, unknown>) =>
    validate(plainToInstance(SampleDto, body), { whitelist: true, forbidNonWhitelisted: true });

  const propertiesOf = async (body: Record<string, unknown>) =>
    (await validateDto(body)).map((error) => error.property);

  it('未指定（undefined）は検証を飛ばすこと（任意項目として扱える）', async () => {
    expect(await validateDto({})).toHaveLength(0);
  });

  it('null を弾くこと（DB の非 null 列へ null を届かせない）', async () => {
    expect(await propertiesOf({ requiredColumn: null })).toContain('requiredColumn');
  });

  it('有効な値は通ること', async () => {
    expect(await validateDto({ requiredColumn: 'x' })).toHaveLength(0);
  });

  it('nullable 列に @IsOptional を使えば null は通ること（クリアできる）', async () => {
    expect(await validateDto({ nullableColumn: null })).toHaveLength(0);
  });

  it('@IsOptional との差は null の扱いだけであること', async () => {
    // 同じ宣言で @IsOptional にした時は null が素通りする（この差が 500 の根因）。
    class OptionalDto {
      @IsOptional()
      @IsString()
      @IsNotEmpty()
      value?: string;
    }
    const withOptional = await validate(plainToInstance(OptionalDto, { value: null }), {
      whitelist: true,
    });
    expect(withOptional).toHaveLength(0);

    const withOptionalNotNull = await validate(
      plainToInstance(SampleDto, { requiredColumn: null }),
      {
        whitelist: true,
      },
    );
    expect(withOptionalNotNull.map((error) => error.property)).toContain('requiredColumn');
  });

  it('生の @ValidateIf と同じ規則であること（意図した primitive を使っている）', async () => {
    class RawValidateIfDto {
      @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
      @IsString()
      @IsNotEmpty()
      value?: string;
    }
    const raw = await validate(plainToInstance(RawValidateIfDto, { value: null }), {
      whitelist: true,
    });
    const wrapper = await validate(plainToInstance(SampleDto, { requiredColumn: null }), {
      whitelist: true,
    });
    expect(raw.map((error) => error.property)).toEqual(['value']);
    expect(wrapper.map((error) => error.property)).toEqual(['requiredColumn']);
  });
});
