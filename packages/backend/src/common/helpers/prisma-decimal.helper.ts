/**
 * Prisma.Decimal を API レスポンス用の number に変換するヘルパー。
 * Prisma.Decimal を直接 import せず structural typing で受ける（テスト容易性）。
 * string は受け取らない — Prisma runtime は Decimal | number | null のみを返す。
 */

type DecimalLike = { toNumber: () => number } | number;

export function decimalToNumber(value: DecimalLike): number {
  if (typeof value === 'number') return value;
  return value.toNumber();
}

export function decimalToNumberNullable(value: DecimalLike | null | undefined): number | null {
  if (value == null) return null;
  return decimalToNumber(value);
}
