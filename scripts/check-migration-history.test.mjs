/**
 * `scripts/check-migration-history.mjs` と `scripts/repair-migration-history.mjs`（d870）の判定を、
 * 使い捨ての記録で確かめる。判定は DB に訊く前の純粋な関数に切り出してあり、ここだけを叩く。
 *
 * 固定する形:
 *   ① 開発 DB で実際に起きていた形（未完了行＋成功行の並び、フォルダに無い行、未適用の移行）が赤くなる
 *   ② 整えた形（移行ごとに 1 行・すべて完了・すべてフォルダに在る）は緑になる
 *   ③ 整えの下見が、残す行と消す行を正しく分ける（古い成功行を消し、後から書かれた行を残す）
 *
 * 使い方: node --test scripts/check-migration-history.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectHistory,
  inspectPreconditions,
  summarizeHistory,
} from './check-migration-history.mjs';
import { planRepair } from './repair-migration-history.mjs';

const onDisk = [
  '20260315133646_init',
  '20261021090000_restrict_product_user_refs',
  '20261028020000_next',
];
const checksum = (name) => `checksum-of-${name}`;
const row = (overrides) => ({
  id: overrides.id ?? `${overrides.migration_name}-${overrides.started_at ?? 't0'}`,
  migration_name: overrides.migration_name,
  finished_at: overrides.finished_at ?? null,
  rolled_back_at: overrides.rolled_back_at ?? null,
  checksum: overrides.checksum ?? checksum(overrides.migration_name),
  started_at: overrides.started_at ?? '2026-10-21T00:00:00Z',
});

test('整えた形は緑になる', () => {
  const rows = onDisk.map((name, index) =>
    row({
      migration_name: name,
      finished_at: '2026-10-21T00:00:00Z',
      started_at: `2026-10-${21 + index}T00:00:00Z`,
    }),
  );
  assert.deepEqual(inspectHistory(rows, onDisk, checksum), []);
  assert.equal(
    summarizeHistory(rows, onDisk),
    'フォルダの移行 3 件 / 記録 3 行（移行 3 種） / 適用済み 3 件',
  );
});

test('開発 DB で起きていた形（未完了行と成功行の並び・フォルダに無い行・未適用）は全部挙げて赤になる', () => {
  const rows = [
    row({ migration_name: '20260315133646_init', finished_at: '2026-10-21T00:00:00Z', id: 'a' }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      finished_at: '2026-10-21T13:07:51Z',
      id: 'b',
    }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      id: 'c',
      rolled_back_at: '2026-10-20T23:14:42Z',
    }),
    row({
      migration_name: '20261020163000_add_stock_product_id_index',
      finished_at: '2026-10-21T00:00:00Z',
      id: 'd',
    }),
  ];
  const problems = inspectHistory(rows, onDisk, checksum);
  assert.equal(problems.length, 4);
  assert.ok(
    problems.some((p) => p.includes('終わっていない移行の記録') && p.includes('巻き戻し済み')),
  );
  assert.ok(problems.some((p) => p.includes('同じ移行の記録が 2 件')));
  assert.ok(
    problems.some((p) => p.includes('未適用の移行がある') && p.includes('20261028020000_next')),
  );
  assert.ok(
    problems.some((p) => p.includes('フォルダに無い移行の記録') && p.includes('20261020163000')),
  );
});

test('移行ファイルが適用後に書き換えられていれば赤になる', () => {
  const rows = onDisk.map((name) =>
    row({ migration_name: name, finished_at: '2026-10-21T00:00:00Z' }),
  );
  rows[0].checksum = 'checksum-of-an-older-version';
  const problems = inspectHistory(rows, onDisk, checksum);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /書き換えられて/);
  assert.match(problems[0], new RegExp(onDisk[0]));
});

test('整えの下見は、フォルダに無い行・未完了行・同じ移行の古い行を消し、最後の成功行を残す', () => {
  const rows = [
    row({
      migration_name: '20260315133646_init',
      finished_at: '2026-10-21T00:00:00Z',
      id: 'init-applied',
    }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      finished_at: '2026-10-21T13:07:51Z',
      id: 'applied',
      started_at: '2026-10-21T13:07:51Z',
    }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      finished_at: '2026-10-20T23:20:00Z',
      id: 'older-applied',
      started_at: '2026-10-20T23:20:00Z',
    }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      id: 'failed',
      rolled_back_at: '2026-10-20T23:14:42Z',
      started_at: '2026-10-20T23:14:42Z',
    }),
    row({
      migration_name: '20261020163000_add_stock_product_id_index',
      finished_at: '2026-10-21T00:00:00Z',
      id: 'diverged',
    }),
    row({
      migration_name: '20261028020000_next',
      finished_at: '2026-10-21T00:00:00Z',
      id: 'next-applied',
    }),
  ];

  const plan = planRepair(rows, onDisk);
  assert.deepEqual(plan.remove.map((r) => r.id).sort(), ['diverged', 'failed', 'older-applied']);
  assert.deepEqual(plan.keep.map((k) => k.id).sort(), ['applied', 'init-applied', 'next-applied']);
});

test('整えの下見は、同じ移行の中で後から書かれた行を残す（古い成功行を残さない）', () => {
  const rows = [
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      finished_at: '2026-10-21T13:07:51Z',
      id: 'later',
      started_at: '2026-10-21T13:07:51Z',
    }),
    row({
      migration_name: '20261021090000_restrict_product_user_refs',
      finished_at: '2026-10-20T23:20:00Z',
      id: 'earlier',
      started_at: '2026-10-20T23:20:00Z',
    }),
  ];
  const plan = planRepair(rows, onDisk);
  assert.deepEqual(plan.keep, [
    { id: 'later', migration_name: '20261021090000_restrict_product_user_refs' },
  ]);
  assert.deepEqual(
    plan.remove.map((r) => r.id),
    ['earlier'],
  );
});

// --- 未適用の移行が、DB に対象（表・制約）を持っているか --------------------------------

const pending = (name) => [
  row({ migration_name: '20260315133646_init', finished_at: '2026-10-21T00:00:00Z' }),
  row({ migration_name: name }),
];
const objects = [
  { kind: 'table', table: 'products', name: null, column: null },
  { kind: 'constraint', table: 'products', name: 'products_created_by_fkey', column: 'created_by' },
];

test('未適用の移行が要る表と制約が DB にある時は、前提の指摘は無い', () => {
  const sqlOf = () =>
    'ALTER TABLE "products" DROP CONSTRAINT "products_created_by_fkey";\nALTER TABLE "products" ALTER COLUMN "id" DROP DEFAULT;';
  assert.deepEqual(
    inspectPreconditions(pending('20261028020000_next'), ['20261028020000_next'], sqlOf, objects),
    [],
  );
});

test('未適用の移行が要る制約が DB に無い時は、落とす制約の名前を挙げて赤くなる', () => {
  const sqlOf = () => 'ALTER TABLE "products" DROP CONSTRAINT "products_updated_by_fkey";';
  const problems = inspectPreconditions(
    pending('20261028020000_next'),
    ['20261028020000_next'],
    sqlOf,
    objects,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /products_updated_by_fkey/);
  assert.match(problems[0], /その制約が無い/);
});

test('未適用の移行が要る表が DB に無い時は、その表を挙げて赤くなる', () => {
  const sqlOf = () => 'ALTER TABLE "announcements" ALTER COLUMN "id" DROP DEFAULT;';
  const problems = inspectPreconditions(
    pending('20261028020000_next'),
    ['20261028020000_next'],
    sqlOf,
    objects,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /announcements 表を必要とするが、DB にその表が無い/);
});

test('適用済みの移行は前提を見ない（すでに当たっている）', () => {
  const sqlOf = () => 'ALTER TABLE "nowhere" DROP CONSTRAINT "gone_fkey";';
  const rows = [
    row({ migration_name: '20261028020000_next', finished_at: '2026-10-21T00:00:00Z' }),
  ];
  assert.deepEqual(inspectPreconditions(rows, ['20261028020000_next'], sqlOf, objects), []);
});
