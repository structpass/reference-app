#!/usr/bin/env node
/**
 * 移行の前提検査（d870）。
 *
 * `20261028020000_restrict_user_refs_without_blocking` は、品目・掲示・設定・告知の 6 本の外部キーを
 * 名前で落として名前で張り直す。対象の表や制約が見つからない時に読み飛ばすと、当たっていないのに
 * 成功の印だけ残り、以後の参照の止めが効かないまま流れる。そこで移行は止まる形にしてあり、
 * 前提を持つ側（表・制約）はここで確かめる。
 *
 * 何を見るか: 移行の実体（ADD CONSTRAINT）に書かれた名前の制約が、DB にすべて残っていること。
 *
 * DB が要る。接続先は環境変数で渡す（コードに書かない）:
 *   MIGRATION_CHECK_DATABASE_URL="postgresql://postgres:<パスワード>@127.0.0.1:5432/struct_pass_dev"
 *   node scripts/check-migration-preconditions.mjs
 *
 * 失敗した履歴の直し方は docs/operations/migration-history-recovery.md の手順に従う。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'packages/backend/prisma/migrations');
const TARGET = '20261028020000_restrict_user_refs_without_blocking';

/**
 * 移行ファイルが張る制約の名前（ADD CONSTRAINT）。
 * 先頭が「%」のものは関数の中の書式（`format('… %I', …)`）で、SQL のまま流す文字列ではないため数えない。
 */
export function addedConstraints(sql) {
  return [...sql.matchAll(/ADD\s+CONSTRAINT\s+(?:"([^"]+)"|(%?[A-Za-z0-9_]+))(?=[\s;])/gi)]
    .map((m) => m[1] ?? m[2])
    .filter((name) => !name.startsWith('%'));
}

/**
 * 移行ファイルが落として張り直す制約（DO ブロックの PERFORM から引く。対象表・制約・欄の 3 つ組）。
 * 落とした後に張り直せば同じ名前が戻るので、名前だけでは元の制約と区別できない。表と欄まで見る。
 * @returns {{ table: string, constraint: string, column: string }[]}
 */
export function rebuiltConstraints(sql) {
  return [
    ...sql.matchAll(
      /PERFORM\s+public\.user_ref_to_restrict\(\s*'public\.([A-Za-z0-9_]+)'::regclass,\s*'([A-Za-z0-9_]+)',\s*'([A-Za-z0-9_]+)'\s*\)/g,
    ),
  ].map((m) => ({ table: m[1], constraint: m[2], column: m[3] }));
}

/**
 * 前提の欠けを返す。`existing` は { conname, relname, column } の一覧。
 * @param {string} sql
 * @param {{ conname: string, relname: string, column: string }[]} existing
 */
export function missingPreconditions(sql, existing) {
  return rebuiltConstraints(sql)
    .filter(
      (target) =>
        !existing.some(
          (c) =>
            c.conname === target.constraint &&
            c.relname === target.table &&
            c.column === target.column,
        ),
    )
    .map((target) => `${target.table}.${target.constraint}（${target.column}）`);
}

const readMigration = (name) =>
  readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

async function main() {
  const url = process.env.MIGRATION_CHECK_DATABASE_URL?.trim();
  if (!url) {
    console.error('MIGRATION_CHECK_DATABASE_URL が空。確かめる DB の接続先を渡す。');
    process.exit(2);
  }

  const sql = readMigration(TARGET);
  const targets = rebuiltConstraints(sql);
  if (targets.length === 0) {
    console.error(
      `${TARGET} から対象の制約を読み取れない（移行の書き方が変わった）。検査の照合先を見直す。`,
    );
    process.exit(2);
  }

  const entry = path.join(ROOT, 'packages/backend/node_modules/@prisma/client/default.js');
  const { PrismaClient } = await import(pathToFileURL(entry).href);
  const client = new PrismaClient({ datasources: { db: { url } } });

  let existing;
  try {
    existing = await client.$queryRaw`
      SELECT c.conname, t.relname, a.attname AS column
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public' AND c.conname = ANY(${targets.map((t) => t.constraint)}::text[])`;
  } catch (error) {
    console.error(`制約を読めない（接続先か DB の状態）: ${error.message}`);
    process.exit(2);
  } finally {
    await client.$disconnect();
  }

  const missing = missingPreconditions(sql, existing);
  if (missing.length > 0) {
    console.error(
      `移行の前提検査に失敗した。\n\n${TARGET} が落として張り直す制約 ${targets.length} 本のうち、${missing.length} 本が見つからない:\n` +
        missing.map((name) => `- 見つからない: ${name}`).join('\n') +
        '\n\n先に移行を当て直す（履歴を整えたうえで prisma migrate deploy）か、その表を作る移行を確認する。\n',
    );
    process.exit(1);
  }

  console.log(
    `移行の前提検査 OK\n${TARGET} の対象 ${targets.length} 本がすべて在る: ${targets.map((t) => t.constraint).join(', ')}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
