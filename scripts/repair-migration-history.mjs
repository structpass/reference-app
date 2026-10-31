#!/usr/bin/env node
/**
 * 移行履歴の整え（d870）。開発 DB の `_prisma_migrations` に残った失敗・重複・DB だけにある記録を、
 * 実測した適用状態に合わせて整える。整えたあとは `scripts/check-migration-history.mjs` が緑になる。
 *
 * 何をするか（理由は docs/operations/migration-history-recovery.md）:
 *   1. 移行フォルダに無い移行の記録を消す（DB だけに残った行は、以後の deploy を止める種になる）
 *   2. 未完了（`finished_at` が空）の行を消す
 *   3. 同じ移行名の記録が並ぶ時は、後から書かれた成功行だけ残す
 *
 * 中身を適用しない行を作らないため、この道具は `migrate resolve --applied` を使わない（`--applied` は
 * 「当て終わった」とその場で印を付けて移行を apply させない）。適用が要る移行は、整えた後に
 * `prisma migrate deploy` へ流し、`_prisma_migrations` の記録も同時に書かせる。
 *
 * 実行前に DB を丸ごと複製する（`docker exec <コンテナ> pg_dump … -Fc` など）。壊れた履歴の修復は
 * 戻せない側の操作なので、複製がある時だけ動かす（`--backup=…` で置き場所を明示する）。
 *
 * 使い方:
 *   MIGRATION_REPAIR_DATABASE_URL="postgresql://postgres:<パスワード>@127.0.0.1:5432/struct_pass_dev" \
 *   node scripts/repair-migration-history.mjs --backup=D:/Dev/tmp/migrate-history/backup/struct_pass_dev-before.dump
 *
 * 既定は下見（何も書かない）。実際に整える時は `--apply` を付ける。
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'packages/backend/prisma/migrations');

/** 移行フォルダの移行名（migration_lock.toml は除く）。 */
export const migrationsOnDisk = () =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/**
 * 記録の行から、消す行と残す行を決める（DB には書かない）。
 * @param {{ id: string, migration_name: string, finished_at: Date | string | null, started_at: Date | string }} rows
 * @param {string[]} onDisk
 * @returns {{ remove: { id: string, reason: string }[], keep: { id: string, migration_name: string }[] }}
 */
export function planRepair(rows, onDisk) {
  const onDiskSet = new Set(onDisk);
  const remove = [];

  let candidates = rows.filter((row) => {
    if (onDiskSet.has(row.migration_name)) return true;
    remove.push({ id: row.id, reason: 'フォルダに無い移行の記録' });
    return false;
  });

  candidates = candidates.filter((row) => {
    if (row.finished_at != null) return true;
    remove.push({ id: row.id, reason: '終わっていない記録' });
    return false;
  });

  const byName = new Map();
  for (const row of candidates)
    byName.set(row.migration_name, [...(byName.get(row.migration_name) ?? []), row]);
  const keep = [];
  for (const list of byName.values()) {
    const ordered = [...list].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    const last = ordered.at(-1);
    keep.push({ id: last.id, migration_name: last.migration_name });
    for (const row of ordered.slice(0, -1)) {
      remove.push({ id: row.id, reason: '同じ移行の古い記録' });
    }
  }

  return { remove, keep };
}

const argValue = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const url = process.env.MIGRATION_REPAIR_DATABASE_URL?.trim();
  const backup = argValue('backup');
  const apply = process.argv.includes('--apply');

  if (!url) {
    console.error('MIGRATION_REPAIR_DATABASE_URL が空。整える DB の接続先を渡す。');
    process.exit(2);
  }
  if (!backup) {
    console.error('--backup=… が要る。整える前に取った DB の複製（戻す先）を渡す。');
    process.exit(2);
  }
  const backupPath = path.resolve(backup);
  let backupSize = 0;
  try {
    backupSize = statSync(backupPath).size;
  } catch {
    console.error(`複製が見つからない: ${backupPath}`);
    process.exit(2);
  }
  if (backupSize === 0) {
    console.error(`複製が空: ${backupPath}`);
    process.exit(2);
  }

  const entry = path.join(ROOT, 'packages/backend/node_modules/@prisma/client/default.js');
  const { PrismaClient } = await import(pathToFileURL(entry).href);
  const client = new PrismaClient({ datasources: { db: { url } } });

  try {
    const rows = await client.$queryRaw`
      SELECT id, migration_name, finished_at, rolled_back_at, started_at
      FROM _prisma_migrations ORDER BY started_at`;
    const plan = planRepair(rows, migrationsOnDisk());

    console.log(
      `記録 ${rows.length} 行 → 残す ${plan.keep.length} 行 / 消す ${plan.remove.length} 行`,
    );
    for (const row of plan.remove) console.log(`  消す: ${row.id}（${row.reason}）`);

    if (plan.remove.length === 0) {
      console.log('消す行は無い（整え済みか、記録が正しい）。');
      return;
    }
    if (!apply) {
      console.log('下見のみ（何も書いていない）。整える時は --apply を付ける。');
      return;
    }

    const removed = await client.$executeRaw`
      DELETE FROM _prisma_migrations WHERE id = ANY(${plan.remove.map((row) => row.id)}::text[])`;
    console.log(
      `${removed} 行を消した。続けて prisma migrate deploy を流し、check-migration-history.mjs で確かめる。`,
    );
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
