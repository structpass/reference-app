#!/usr/bin/env node
/**
 * 移行履歴の検査（d870）。
 *
 * 開発 DB の `_prisma_migrations` に、失敗した移行（20261021090000_restrict_product_user_refs）の
 * 未完了行と成功行が並んだまま残っていた。未完了の行が 1 つでもあると `prisma migrate deploy` は
 * P3009 で全体を止めるため、その後の移行（20261028020000・20261028030000）が一切適用できない。
 * 未完了行を消すだけでは直らない: その移行は表を止めない形で作り直されて中身が変わっており、
 * 何も当たっていない未完了行を消すと、品目の参照制約 2 本が無いまま次の移行へ進んで止まる
 * （計測用の複製で実測）。どの DB でも同じ手順で同じ状態へ戻るよう、手順をこの検査に固定する。
 *
 * 見るもの（どれか 1 つでも外れたら赤）:
 *   1. `_prisma_migrations` に、終わっていない行が残っていない
 *   2. 同じ移行名の行が二重に残っていない
 *   3. 移行フォルダの移行がすべて適用済み（未適用があれば deploy が止まる）
 *   4. DB にあるがフォルダに無い移行が残っていない
 *   5. 移行ファイルが適用後に書き換えられていない（成功行の checksum と一致する）
 *
 * 読み取りだけを行い、DB は書き換えない。接続先もコードに書かず、値を外から渡して指定する:
 *   MIGRATION_CHECK_DATABASE_URL="postgresql://postgres:<パスワード>@127.0.0.1:5432/struct_pass_dev"
 *   node scripts/check-migration-history.mjs
 *
 * 失敗した履歴の直し方は docs/operations/migration-history-recovery.md の手順に従う。
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'packages/backend/prisma/migrations');

/** 移行フォルダの一覧（migration_lock.toml は除く）。 */
const migrationsOnDisk = () =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** 移行ファイルの中身。 */
const readMigration = (name) =>
  readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

/** 移行ファイルの checksum（Prisma と同じく sha256 の 16 進）。 */
const checksumOf = (name) =>
  createHash('sha256')
    .update(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')))
    .digest('hex');

/** 改行だけを変えた中身の checksum（記録がどちらの改行で取られたかを見分ける）。 */
const checksumOfLineEnding = (name, lineEnding) => {
  const text = readMigration(name).replace(/\r\n/g, '\n');
  return createHash('sha256')
    .update(lineEnding === 'crlf' ? text.replace(/\n/g, '\r\n') : text)
    .digest('hex');
};

/**
 * DB の履歴とフォルダを突き合わせて、問題の一覧を返す。どの DB でも同じ判定になるよう、DB に訊くのはここだけ。
 * @param {{ migration_name: string, finished_at: Date | string | null, rolled_back_at: Date | string | null, checksum: string }[]} rows
 * @param {string[]} onDisk
 * @param {(name: string) => string} checksum
 * @param {(name: string, lineEnding: 'crlf' | 'lf') => string | null} [checksumWith] 改行を変えた中身の checksum。
 *   渡すと、LF で合わない時に CRLF でも比べ、記録の改行が分かる（中身の書き換えか、改行の違いかを切り分ける）
 * @returns {string[]}
 */
export function inspectHistory(rows, onDisk, checksum, checksumWith = null) {
  const problems = [];

  for (const row of rows.filter((r) => r.finished_at == null)) {
    const rolledBack = row.rolled_back_at != null ? '（巻き戻し済み）' : '';
    problems.push(`終わっていない移行の記録が残っている: ${row.migration_name}${rolledBack}`);
  }

  const byName = new Map();
  for (const row of rows)
    byName.set(row.migration_name, [...(byName.get(row.migration_name) ?? []), row]);
  for (const [name, list] of byName) {
    if (list.length > 1) problems.push(`同じ移行の記録が ${list.length} 件ある: ${name}`);
  }

  const onDiskSet = new Set(onDisk);
  const applied = new Set(
    rows
      .filter((row) => row.finished_at != null && row.rolled_back_at == null)
      .map((row) => row.migration_name),
  );
  for (const name of onDisk) {
    if (!applied.has(name)) problems.push(`未適用の移行がある（deploy が止まる）: ${name}`);
  }
  for (const [name, list] of byName) {
    if (onDiskSet.has(name)) continue;
    problems.push(`DB にあるがフォルダに無い移行の記録がある: ${name}（${list.length} 件）`);
  }

  for (const row of rows) {
    if (row.finished_at == null || row.rolled_back_at != null) continue;
    if (!onDiskSet.has(row.migration_name)) continue;
    const actual = checksum(row.migration_name);
    if (row.checksum === actual) continue;

    const crlf = checksumWith?.(row.migration_name, 'crlf');
    if (crlf !== undefined && crlf === row.checksum) {
      problems.push(
        `移行ファイルの改行が、当てた時（CRLF）と違う: ${row.migration_name}（いまは LF）。中身の書き換えではない`,
      );
    } else {
      problems.push(
        `移行ファイルが適用後に書き換えられている: ${row.migration_name}（記録 ${String(row.checksum).slice(0, 12)}… / 現在 ${actual.slice(0, 12)}…）`,
      );
    }
  }

  return problems;
}

/**
 * まだ当てていない移行が、DB にその対象（表・制約）を先に持っているかを返す。持っていないまま当てると、
 * 移行は対象を見つけられずに途中で止まり、未完了の行が残って以後の deploy が止まる（d870 で実測）。
 *
 * 見るのは「当てた時に先に在るべきもの」だけで、その移行が自分で作るものは見ない。
 *   - `ALTER TABLE "表"`／`ALTER TABLE public.表` … 当てる前にその表が在ること
 *     （その移行が同じ種類の文で作っている表は、先に在らなくてよい）
 *   - `DROP CONSTRAINT "名"` … 落とす制約が先に在ること（表を名指ししているなら同じ表にあること）
 *
 * @param {{ migration_name: string, finished_at: Date | string | null, rolled_back_at: Date | string | null }[]} rows
 * @param {string[]} onDisk
 * @param {(name: string) => string} readMigration
 * @param {{ name: string | null, table: string | null, column: string | null, kind: string }[]} objects
 * @returns {string[]}
 */
export function inspectPreconditions(rows, onDisk, readMigration, objects) {
  const applied = new Set(
    rows
      .filter((row) => row.finished_at != null && row.rolled_back_at == null)
      .map((row) => row.migration_name),
  );
  const tables = new Set(objects.filter((o) => o.kind === 'table').map((o) => o.table));
  const constraints = objects.filter((o) => o.kind === 'constraint');
  const problems = [];

  for (const name of onDisk) {
    if (applied.has(name)) continue;
    const sql = readMigration(name);

    // 表の名前は引用符付き（"x"）と裸（public.x）の両方で書かれる。
    const tableRefs =
      /(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:ONLY\s+)?(?:"([^"]+)"|(?:public\.)?([A-Za-z_][A-Za-z0-9_]*))/g;
    const creates = new Set(
      [
        ...sql.matchAll(
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(?:public\.)?([A-Za-z_][A-Za-z0-9_]*))/g,
        ),
      ].map((m) => m[1] ?? m[2]),
    );
    for (const [, quoted, bare] of sql.matchAll(tableRefs)) {
      const table = quoted ?? bare;
      if (creates.has(table) || tables.has(table)) continue;
      problems.push(
        `${name} は ${table} 表を必要とするが、DB にその表が無い（当てると途中で止まる）`,
      );
    }

    for (const [, quoted, bare, trailing] of sql.matchAll(
      /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))([^;]*)/g,
    )) {
      const constraint = quoted ?? bare;
      if (constraint.includes('%')) continue; // format('… %I') の書式は名前ではない
      const ownTable = /^\s+ON\s+(?:"([^"]+)"|(?:public\.)?([A-Za-z_][A-Za-z0-9_]*))/.exec(
        trailing,
      );
      const table = ownTable ? (ownTable[1] ?? ownTable[2]) : null;
      const found = constraints.filter(
        (c) => c.name === constraint && (table === null || c.table === table),
      );
      if (found.length === 0) {
        problems.push(
          `${name} は ${table ? `${table} の ` : ''}${constraint} を落とすが、DB にその制約が無い`,
        );
      }
    }
  }
  return problems;
}

/** 記録とフォルダから、人の目で確かめるための要約を作る。 */
export function summarizeHistory(rows, onDisk) {
  const onDiskSet = new Set(onDisk);
  const applied = new Set(
    rows
      .filter((row) => row.finished_at != null && row.rolled_back_at == null)
      .map((row) => row.migration_name),
  );
  return [
    `フォルダの移行 ${onDisk.length} 件`,
    `記録 ${rows.length} 行（移行 ${new Set(rows.map((r) => r.migration_name)).size} 種）`,
    `適用済み ${[...applied].filter((name) => onDiskSet.has(name)).length} 件`,
  ].join(' / ');
}

/** `--名前=値` の形の引数を読む。 */
const argValue = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

/** Prisma のスキーマから DB の接続先の決め方を読み、検査に使う DB の接続先を組み立てる。 */
function databaseUrlFromPrismaSchema() {
  const schema = readFileSync(path.join(ROOT, 'packages/backend/prisma/schema.prisma'), 'utf8');
  const block = /datasource\s+\w+\s*\{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
  const raw = /url\s*=\s*env\(\s*"([^"]+)"\s*\)/.exec(block)?.[1];
  if (!raw) return null;
  const value = process.env[raw];
  return value ? { variable: raw, url: value } : null;
}

async function main() {
  const fromEnv = process.env.MIGRATION_CHECK_DATABASE_URL?.trim();
  const fromSchema = databaseUrlFromPrismaSchema();
  const target = fromEnv ? { variable: 'MIGRATION_CHECK_DATABASE_URL', url: fromEnv } : fromSchema;

  if (!target) {
    console.error(
      '確かめる DB の接続先が分からない。環境変数 MIGRATION_CHECK_DATABASE_URL か、スキーマが読む DATABASE_URL を渡す。',
    );
    process.exit(2);
  }

  let DatabaseClient;
  try {
    // ルートからは読めない（pnpm の配置はパッケージごと）。バックエンドが使う実物をそのまま使う。
    const entry = path.join(ROOT, 'packages/backend/node_modules/@prisma/client/default.js');
    const { PrismaClient } = await import(pathToFileURL(entry).href);
    DatabaseClient = PrismaClient;
  } catch (error) {
    console.error(
      `@prisma/client を読み込めない（pnpm install と prisma generate が要る）: ${error.message}`,
    );
    process.exit(2);
  }

  const client = new DatabaseClient({ datasources: { db: { url: target.url } } });
  let rows;
  let objects;
  try {
    rows =
      await client.$queryRaw`SELECT migration_name, finished_at, rolled_back_at, checksum FROM _prisma_migrations ORDER BY started_at`;
    // 適用が要る移行が、DB にその対象（表・制約）を持っているかも見る。持っていないまま当てると、
    // 途中で止まって未完了行が残り、以後の deploy が P3009 で止まる（d870 で実測）。
    objects = await client.$queryRaw`
      SELECT c.conname AS name, t.relname AS table, a.attname AS column, 'constraint' AS kind
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT null, c.relname, null, 'table'
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
  } catch (error) {
    console.error(
      `移行の記録を読めない（接続先 ${target.variable} か、この DB で移行を流したことがあるか）: ${error.message}`,
    );
    process.exit(2);
  } finally {
    await client.$disconnect();
  }

  const onDisk = migrationsOnDisk();
  // fallow（開発 DB の既知の崩れ）を分けて出せるようにする。止める側（CI・本番の確認）では strict で通さない。
  const kindOf = (problem) => (problem.startsWith('移行ファイルの改行が') ? 'fallow' : 'blocking');
  const classified = [
    ...inspectHistory(rows, onDisk, checksumOf, checksumOfLineEnding).map((p) => [kindOf(p), p]),
    ...inspectPreconditions(rows, onDisk, readMigration, objects).map((p) => [kindOf(p), p]),
  ];
  const strict = process.argv.includes('--strict');
  const kind = argValue('kind') ?? (strict ? 'blocking' : 'all');
  const problems = classified.filter(([k]) => kind === 'all' || k === kind).map(([, p]) => p);
  const report = summarizeHistory(rows, onDisk);

  if (problems.length > 0) {
    console.error(
      `移行履歴の検査に失敗した（${kind === 'all' ? '止める所と、開発 DB で昔から続く崩れの両方' : kind === 'blocking' ? '止める所' : '開発 DB で昔から続く崩れだけ'}）。\n\n${report}\n\n${problems.map((p) => `- ${p}`).join('\n')}\n\n直し方は docs/operations/migration-history-recovery.md の手順に従う。\n`,
    );
    process.exit(1);
  }

  console.log(`移行履歴の検査 OK\n${report}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
