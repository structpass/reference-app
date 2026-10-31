/**
 * `scripts/check-migration-preconditions.mjs`（d870）が、移行の実体から正しい対象を引けるかを確かめる。
 *
 * 何を固定するか:
 *   1. 実際の移行ファイルから、落として張り直す 6 本（表・制約・欄）を引ける
 *   2. 名前だけでは区別できない（落として同じ名前で張り直すので）ので、表と欄まで照合する
 *   3. 関数の中の書式（`format('… %I', …)`）を制約名として拾わない
 *
 * 使い方: node --test scripts/check-migration-preconditions.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addedConstraints,
  rebuiltConstraints,
  missingPreconditions,
} from './check-migration-preconditions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = '20261028020000_restrict_user_refs_without_blocking';
const sql = readFileSync(
  path.join(ROOT, 'packages/backend/prisma/migrations', TARGET, 'migration.sql'),
  'utf8',
);

const existingAll = [
  { conname: 'products_created_by_fkey', relname: 'products', column: 'created_by' },
  { conname: 'products_updated_by_fkey', relname: 'products', column: 'updated_by' },
  {
    conname: 'announcements_updated_by_id_fkey',
    relname: 'announcements',
    column: 'updated_by_id',
  },
  {
    conname: 'system_parameters_updated_by_id_fkey',
    relname: 'system_parameters',
    column: 'updated_by_id',
  },
  {
    conname: 'table_pagination_settings_updated_by_id_fkey',
    relname: 'table_pagination_settings',
    column: 'updated_by_id',
  },
  {
    conname: 'announcement_attachments_created_by_id_fkey',
    relname: 'announcement_attachments',
    column: 'created_by_id',
  },
];

test('実際の移行ファイルから、落として張り直す 6 本の表・制約・欄を引ける', () => {
  assert.deepEqual(rebuiltConstraints(sql), [
    { table: 'products', constraint: 'products_created_by_fkey', column: 'created_by' },
    { table: 'products', constraint: 'products_updated_by_fkey', column: 'updated_by' },
    {
      table: 'announcements',
      constraint: 'announcements_updated_by_id_fkey',
      column: 'updated_by_id',
    },
    {
      table: 'system_parameters',
      constraint: 'system_parameters_updated_by_id_fkey',
      column: 'updated_by_id',
    },
    {
      table: 'table_pagination_settings',
      constraint: 'table_pagination_settings_updated_by_id_fkey',
      column: 'updated_by_id',
    },
    {
      table: 'announcement_attachments',
      constraint: 'announcement_attachments_created_by_id_fkey',
      column: 'created_by_id',
    },
  ]);
});

test('関数の中の書式（%I）を制約名として拾わない', () => {
  const names = addedConstraints(sql);
  assert.ok(
    names.every((name) => !name.startsWith('%')),
    names.join(', '),
  );
});

test('6 本がすべて在れば欠けは無い', () => {
  assert.deepEqual(missingPreconditions(sql, existingAll), []);
});

test('別スキーマに同じ名前の制約があっても、対象表に無ければ欠けとして挙げる', () => {
  const rows = existingAll
    .filter((c) => c.conname !== 'products_created_by_fkey')
    .concat([
      { conname: 'products_created_by_fkey', relname: 'products_old', column: 'created_by' },
    ]);
  assert.deepEqual(missingPreconditions(sql, rows), [
    'products.products_created_by_fkey（created_by）',
  ]);
});

test('名前が同じでも欄が違えば欠けとして挙げる（落とした後の別の定義と取り違えない）', () => {
  const rows = existingAll.map((c) =>
    c.conname === 'products_updated_by_fkey' ? { ...c, column: 'created_by' } : c,
  );
  assert.deepEqual(missingPreconditions(sql, rows), [
    'products.products_updated_by_fkey（updated_by）',
  ]);
});
