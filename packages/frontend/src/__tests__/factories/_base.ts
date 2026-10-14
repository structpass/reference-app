/**
 * Test entity factory base.
 *
 * 使い方:
 *   const makeUser = makeBase<User>({ id: 'u-1', name: 'tanaka', ... });
 *   const user = makeUser({ role: 'SYS_ADMIN' });
 *
 * 設計:
 * - default 値は hardcode (predictable / determinate)
 * - 例外フィールドは override で明示的に指定
 * - shared 型 (`@struct-pass/shared`) を import するのみ、新規型定義は禁止
 *   （architecture-invariants §5: shared 型整合）
 */
export type FactoryBuilder<T> = (overrides?: Partial<T>) => T;

export function makeBase<T>(defaults: T): FactoryBuilder<T> {
  return (overrides) => ({ ...defaults, ...overrides });
}

/** 全 factory が共有する固定日付 (snapshot 比較を安定化) */
const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');
/** ISO 8601 文字列。shared 型の日付フィールドは string（ADR 0011）なので factory はこちらを使う */
export const BASE_DATE_ISO = BASE_DATE.toISOString();
