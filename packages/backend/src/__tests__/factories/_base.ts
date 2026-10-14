/**
 * Backend test factory base.
 *
 * frontend factory と同じ `makeBase<T>` パターン。
 * backend は Prisma entity (with relations) を mock する用途。
 * mapper spec / repository spec / service spec で利用する。
 *
 * 注意: overrides 型は `Partial<T>` ではなく「各フィールドに null も許容するゆるい
 * Partial」にしている。理由は mapper の `null → undefined` 変換テストで
 * `{ relation: null }` を override として渡したいケースが多く、Prisma の
 * include 型は relation を `T | null` ではなく `T | undefined` で表現する
 * ことがあるため、`Partial<T>` だと TS2322 で弾かれる。
 */
export type FactoryOverrides<T> = { [K in keyof T]?: T[K] | null };
export type FactoryBuilder<T> = (overrides?: FactoryOverrides<T>) => T;

export function makeBase<T>(defaults: T): FactoryBuilder<T> {
  return (overrides) => ({ ...defaults, ...(overrides as Partial<T>) });
}

export const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');
export const BASE_DATE_ISO = BASE_DATE.toISOString();
