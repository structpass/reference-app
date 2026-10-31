import { ValidateIf } from 'class-validator';

/**
 * 「未指定（`undefined`）だけを許す」任意項目のためのデコレータ。
 *
 * `@IsOptional()` は `null` と `undefined` の**両方**で検証を飛ばすため、JSON の明示 `null` が
 * 検証を素通りして service → repository → Prisma まで届き、DB の非 null 列で
 * `Argument ... must not be null` の 500 INTERNAL_ERROR になる（v2-428・v2-445・v2-456 の実測）。
 *
 * `@ValidateIf` は `undefined` の時だけ検証を飛ばすので、`null` は各 validator に落ちて
 * 400 VALIDATION_ERROR になる。「未指定は既定値／変更なし、`null` は入れられない値」という
 * 規則を DTO の宣言だけで表せる。
 *
 * **DB の非 null 列にだけ付ける。** nullable 列（`String?` / `Int?` / `DateTime?` など）は
 * `null` が正しい入力（値のクリア）なので、従来どおり `@IsOptional()` を使う。
 * `@nestjs/swagger` の `PartialType` は全項目へ `@IsOptional()` を付けてこの規則を打ち消すため、
 * 更新 DTO では `PartialType(CreateX, { skipNullProperties: false })` を使う（同じ規則が写る）。
 */
export function OptionalNotNull(): PropertyDecorator {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined);
}
