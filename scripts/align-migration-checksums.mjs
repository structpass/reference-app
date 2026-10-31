#!/usr/bin/env node
/**
 * 移行の記録の checksum を、いまの移行ファイルの中身へ揃える（d871）。
 *
 * 何のためにあるか: 当てた後に移行ファイルを書き換えた移行や、CRLF の内容で当てた初期の移行が
 * あると、`_prisma_migrations` の checksum と手元のファイルが食い違い、`scripts/check-migration-history.mjs`
 * が恒常的に赤くなる。DB のスキーマの実体は各移行が狙った最終形のままなので、**ファイルを当てた時の姿へ
 * 戻すのではなく、記録側をいまのファイルに合わせる**（ファイルは書き換えない）。
 *
 * 規約との関係（docs/operations/migration-file-editing.md）:
 *   - 適用済みの移行ファイルを書き換えない（規約を維持する）。この道具は縫わない・足さない
 *   - 記録を揃えるのは、DB の中身を変えない簿記の直しである
 *
 * 動かす側の制約:
 *   - 開発 DB 名（`--allow-database=`、既定 `struct_pass_dev`）だけを対象にする。本番・検証用など別名の
 *     DB は、名前を明示しない限りは拒む（本番の記録を揃えると、食い違いを本番で隠すことになる）
 *   - 既定は下見（何も書かない）。実際に揃える時は `--apply`
 *   - DB の複製を先に取り、`--backup=…` で置き場所を渡す。空・不在なら止まる（戻せない操作のため）
 *   - 揃える対象は `--only=名前,名前` で明示する（対象なきまま全部を揃えない）
 *   - 変えるのは `_prisma_migrations` の checksum の欄だけ（行は消さない・足さない）
 *   - 中身の食い違い（改行の違いではないもの）を含む時は、`--allow-content-diff` が要る
 *     （改行の違いは中身が同じなので、そのまま流してよい）
 *   - 中身の食い違いを承認する時は、揃える版の移行ファイルの中身と行数を先に出し、
 *     `--approval-record=<ファイル>` を必ず書く（DB は checksum しか持たないため差分は出せないが、
 *     何を承認したかはこれで残る・d927）
 *   - 下見は、揃える 1 件ごとに変更前後の checksum を出し、対象に挙げていない移行は
 *     「射程外（触らない）」として名前つきで並べる（見落としを作らない）
 *
 * 使い方:
 *   MIGRATION_ALIGN_DATABASE_URL="postgresql://postgres:<パスワード>@127.0.0.1:5432/struct_pass_dev" \
 *   node scripts/align-migration-checksums.mjs --backup=<複製のパス> --only=20260315133646_init,...
 *
 * 揃えた後は `scripts/check-migration-history.mjs` を流し、緑になることを確かめる。
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/** 移行ファイルの中身（そのまま）。 */
export const readMigration = (name) =>
  readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

/** ファイルの中身の checksum（Prisma と同じく sha256 の 16 進）。 */
export const checksumOf = (name) =>
  createHash('sha256')
    .update(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')))
    .digest('hex');

/** 改行だけを変えた中身の checksum（記録がどちらの改行で取られたかを見分ける）。 */
export const checksumOfLineEnding = (name, lineEnding) => {
  const text = readMigration(name).replace(/\r\n/g, '\n');
  return createHash('sha256')
    .update(lineEnding === 'crlf' ? text.replace(/\n/g, '\r\n') : text)
    .digest('hex');
};

/**
 * 記録の checksum を、いまのファイルの中身へ揃える計画を立てる（DB には書かない）。
 *
 * 揃える側に倒す条件:
 *   - 記録が `--only` の名前に含まれる（明示された対象だけを触る）
 *   - 適用済み・巻き戻し済みでない行（終わっていない行・巻き戻し済みは別の道具の担当）
 *   - フォルダにファイルがある
 *   - 記録の checksum が、いまのファイルと違う
 *
 * 中身の違いと改行の違いを分ける: 改行だけの違いは、中身が同じ（改行の文字だけが違う）なので、
 * 内容を確かめずに揃えてよい。それ以外の違いは「当てた後に書き換えた」に当たるので、
 * `--allow-content-diff` が無い時は揃える前に止める（事故を確かめる場所）。
 *
 * @param {{ migration_name: string, finished_at: Date | string | null, rolled_back_at: Date | string | null, checksum: string }[]} rows
 * @param {string[]} onDisk
 * @param {(name: string) => string} checksum いまのファイルの checksum
 * @param {(name: string, lineEnding: 'crlf' | 'lf') => string | null} [checksumWith] 改行を変えた中身の checksum
 * @param {{ only: string[], allowContentDiff?: boolean }} options
 * @returns {{ align: { name: string, from: string, to: string, kind: 'line-ending' | 'content' }[], skip: { name: string, reason: string }[], unknown: string[], untouched: { name: string, reason: string }[] }}
 */
export function planAlign(rows, onDisk, checksum, checksumWith = null, options) {
  const only = new Set(options.only ?? []);
  const onDiskSet = new Set(onDisk);
  const align = [];
  const skip = [];
  const untouched = [];

  for (const name of onDisk) {
    if (!only.has(name)) continue;
    const row = rows.find(
      (r) => r.migration_name === name && r.finished_at != null && r.rolled_back_at == null,
    );
    if (!row) {
      skip.push({ name, reason: '適用済みの記録が無い' });
      continue;
    }
    const actual = checksum(name);
    if (row.checksum === actual) {
      skip.push({ name, reason: 'すでに一致している' });
      continue;
    }
    const crlf = checksumWith?.(name, 'crlf');
    const kind = crlf !== undefined && crlf === row.checksum ? 'line-ending' : 'content';
    align.push({ name, from: row.checksum, to: actual, kind });
  }

  // 対象に挙げていない移行は触らない。ずれたまま残るものは名前を出して、見落としを作らない
  // （対象の指定漏れ・範囲の取り違えは、ここで人の目に付く）。
  for (const name of onDisk) {
    if (only.has(name)) continue;
    const row = rows.find(
      (r) => r.migration_name === name && r.finished_at != null && r.rolled_back_at == null,
    );
    if (!row || row.checksum === checksum(name)) continue;
    untouched.push({ name, reason: '対象に挙げていない（射程外）' });
  }

  // 記録にあるがファイルが無い名前は、明示しても揃え先の中身が無いので挙げる（黙って無視しない）。
  const unknown = (options.only ?? []).filter((name) => !onDiskSet.has(name));
  return { align, skip, unknown, untouched };
}

/**
 * 中身の違いを承認する時の門を決める（d927）。
 *
 * 返す値:
 *   - 'refuse-unapproved' … --allow-content-diff が無い。中身を出して止める（DB は触らない）
 *   - 'needs-record'      … 承認はされたが --approval-record が無い。中身を出して止める（DB は触らない）
 *   - 'proceed'           … 承認と記録の置き場所が揃っている。中身を出してから揃える
 *   - 'skip'              … 中身の違いが無い（改行の違いだけ）。この門は素通り
 *
 * @param {{ kind: 'line-ending' | 'content' }[]} contentDiff 中身の違いの項目だけ
 * @param {{ allowContentDiff: boolean, approvalRecord: string | undefined }} flags
 * @returns {'refuse-unapproved' | 'needs-record' | 'proceed' | 'skip'}
 */
export function contentGate(contentDiff, flags) {
  if (contentDiff.length === 0) return 'skip';
  if (!flags.allowContentDiff) return 'refuse-unapproved';
  if (!flags.approvalRecord) return 'needs-record';
  return 'proceed';
}

/** 承認の門で止まったことを表す（CLI 側で process.exit に変える）。 */
export class StopSignal extends Error {
  constructor(code) {
    super(`stop(${code})`);
    this.name = 'StopSignal';
    this.code = code;
  }
}

/**
 * 計画ができた後の筋道（d927）: 承認の門 → 中身を出す → 書く。
 *
 * 効果（出力・停止・書込み・記録の書き出し）は全部外から受け取る。これにより、試験は
 * **CLI と同じ順序**で「止まる時は 1 行も書かない」「止まる時も中身を出す」を確かめられる。
 * 門の判定だけを試験しても、CLI がその戻り値で止まることは縛れなかった（独立の目の指摘）。
 *
 * @param {{
 *   plan: { align: { name: string, from: string, to: string, kind: 'line-ending' | 'content' }[] },
 *   allowContentDiff: boolean,
 *   approvalRecord: string | undefined,
 *   apply: boolean,
 *   log: (message: string) => void,
 *   logError: (message: string) => void,
 *   stop: (code: number) => never,
 *   write: (item: { name: string, from: string, to: string, kind: string }) => Promise<number>,
 *   readContent: (name: string) => string,
 *   writeRecord: (file: string | undefined, items: object[]) => void,
 * }} deps
 */
export async function runPlanAfterApproval(deps) {
  const contentDiff = deps.plan.align.filter((item) => item.kind === 'content');
  const gate = contentGate(contentDiff, {
    allowContentDiff: deps.allowContentDiff,
    approvalRecord: deps.approvalRecord,
  });

  if (gate === 'refuse-unapproved') {
    deps.logError(
      `中身の違いが ${contentDiff.length} 件ある（当てた後に書き換えた移行）。記録を揃えると、この違いは以後の検査で見えなくなる。\n` +
        `揃えてよいと決めた場合は --allow-content-diff を付けて流す。`,
    );
    // 承認する前に、何を承認するのかを読める形で出す（--allow-content-diff を付けずに
    // 流した時も、これを見て判断できるようにする）。
    printContentApprovalTo(contentDiff, deps.readContent, deps.log);
    return deps.stop(2);
  }
  if (gate === 'needs-record') {
    printContentApprovalTo(contentDiff, deps.readContent, deps.log);
    deps.logError(
      '中身の違いを承認して揃える時は --approval-record=<ファイル> が要る。\n' +
        '承認した内容と checksum を書き出し、決定の記録へ写せる形にする。',
    );
    return deps.stop(2);
  }
  if (!deps.apply) {
    // 下見では中身を出さない（承認の判断は --apply を付けた実行で読む・d927）。
    deps.log('下見のみ（何も書いていない）。揃える時は --apply を付ける。');
    return;
  }
  // ここから書く。書く前に、承認する中身を必ず出す（読まずに通せない）。
  printContentApprovalTo(contentDiff, deps.readContent, deps.log);

  let updated = 0;
  for (const item of deps.plan.align) {
    const changed = await deps.write(item);
    updated += changed;
    deps.log(
      `  揃えた: ${item.name} ${item.from} → ${item.to}（${item.kind === 'line-ending' ? '改行の違い' : '中身の違い'}・${changed} 行）`,
    );
  }
  deps.log(`${updated} 行の checksum を揃えた。続けて check-migration-history.mjs で確かめる。`);
  if (contentDiff.length > 0) deps.writeRecord(deps.approvalRecord, contentDiff);
}

/**
 * 中身の違いを承認する時に、何を承認するのかを人が読める形にする（d927）。
 *
 * DB の `_prisma_migrations` は checksum（sha256）しか持たないため、**当てた時の中身は
 * もう残っていない**。だから「何が変わったか」を差分として出すことはできない。代わりに、
 * 揃えると決めた移行の**いまの中身全部**を出し、何行・どの checksum の内容を承認したのかを
 * 記録に残せる形にする（読まずに --allow-content-diff 1 つで通せないようにする）。
 *
 * @param {{ name: string, from: string, to: string, kind: 'line-ending' | 'content' }[]} items
 * @param {(name: string) => string} readContent 移行ファイルの中身
 * @returns {{ name: string, from: string, to: string, lines: number, content: string }[]}
 */
export function contentApprovalDigest(items, readContent) {
  return items
    .filter((item) => item.kind === 'content')
    .map((item) => {
      const content = readContent(item.name);
      return {
        name: item.name,
        from: item.from,
        to: item.to,
        // 末尾の改行は行として数えない（人の目で数えた行数と合わせる）。
        lines: content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length,
        content,
      };
    });
}

const argValue = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

/**
 * 中身の違いを承認する前に、承認する中身そのものを出す（d927）。
 * DB は checksum しか持たないため差分（何がどう変わったか）は出せない。代わりに、
 * 揃えると決めた版の中身全部を出し、何行の何を承認したのかを読める形にする。
 *
 * 出力先を受け取る版（試験が CLI と同じ筋道で確かめられるようにする）。
 */
export function printContentApprovalTo(items, readContent, log) {
  const digest = contentApprovalDigest(items, readContent);
  log(
    `\n中身の違い ${digest.length} 件。当てた時の中身は DB に残っていないため差分は出せない。` +
      `以下は揃える版（記録を合わせる先）の中身そのもの。読んで承認するか決めること。`,
  );
  for (const item of digest) {
    log(`\n--- ${item.name}（${item.lines} 行）`);
    log(`    記録 ${item.from}… → 揃える先 ${item.to}…`);
    log(item.content);
    log(`--- ${item.name} ここまで`);
  }
  log(
    '\n承認する（揃える）時は --allow-content-diff を付ける。承認した事実は' +
      '--approval-record=<ファイル> で書き出す（決定の記録へそのまま写せる形）。',
  );
}

/**
 * 承認した事実を残す（d927）。揃えると DB からは経緯が辿れなくなるため、
 * 何を・どの checksum へ揃えたかを人が読める形で書き出す。
 */
function writeApprovalRecord(file, items, readContent = readMigration) {
  const digest = contentApprovalDigest(items, readContent);
  const record = {
    recordedAt: new Date().toISOString(),
    database: argValue('allow-database') ?? 'struct_pass_dev',
    backup: argValue('backup') ?? null,
    // 当てた時の中身は残っていないので、承認したのは「この版に揃えること」であると明記する。
    note: '承認したのは、いまの移行ファイルの中身（下の中身）である。当てた時の中身は DB に checksum しか残っておらず、差分は残せない。',
    approved: digest.map((item) => ({
      name: item.name,
      from: item.from,
      to: item.to,
      lines: item.lines,
      content: item.content,
    })),
  };
  writeFileSync(path.resolve(file), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(`承認の記録を書いた: ${path.resolve(file)}（決定の記録へ写すこと）`);
}

async function main() {
  const url = process.env.MIGRATION_ALIGN_DATABASE_URL?.trim();
  const backup = argValue('backup');
  const only = (argValue('only') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const allowContentDiff = process.argv.includes('--allow-content-diff');
  const apply = process.argv.includes('--apply');
  const allowDatabase = argValue('allow-database') ?? 'struct_pass_dev';

  if (!url) {
    console.error('MIGRATION_ALIGN_DATABASE_URL が空。揃える DB の接続先を渡す。');
    process.exit(2);
  }
  // 接続先の DB 名が想定（開発 DB）と違えば止める。本番・検証用の DB で記録を揃えると、
  // 食い違いをその DB の上で隠すことになる（揃えるのは開発 DB だけの簿記の直し）。
  const databaseName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '') || '';
    } catch {
      return '';
    }
  })();
  if (databaseName !== allowDatabase) {
    console.error(
      `接続先の DB（${databaseName || '読めない'}）は想定（${allowDatabase}）と違う。揃えるのは開発 DB だけ。\n` +
        `別の DB を揃えると決めた時だけ --allow-database=名前 を付けて流す。`,
    );
    process.exit(2);
  }
  if (!backup) {
    console.error('--backup=… が要る。揃える前に取った DB の複製（戻す先）を渡す。');
    process.exit(2);
  }
  if (only.length === 0) {
    console.error('--only=名前,名前 が要る。揃える対象を明示する（全部を一括では揃えない）。');
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

  // 接続して作業し、止まった時も含めて必ず閉じてから外へ返す（d927）。
  await withConnectedClient({
    connect: async () => new PrismaClient({ datasources: { db: { url } } }),
    work: async (client) => {
      const rows = await client.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, checksum
      FROM _prisma_migrations ORDER BY started_at`;
      const plan = planAlign(rows, migrationsOnDisk(), checksumOf, checksumOfLineEnding, {
        only,
        allowContentDiff,
      });

      console.log(`揃える ${plan.align.length} 件 / 外す ${plan.skip.length} 件`);
      for (const item of plan.align) {
        const label = item.kind === 'line-ending' ? '改行の違い（中身は同じ）' : '中身の違い';
        console.log(
          `  揃える: ${item.name}（${label} / ${item.from.slice(0, 12)}… → ${item.to.slice(0, 12)}…）`,
        );
      }
      for (const item of plan.skip) console.log(`  外す: ${item.name}（${item.reason}）`);
      for (const item of plan.untouched)
        console.log(
          `  射程外（触らない）: ${item.name}（${item.reason}・記録とファイルがずれたまま残る）`,
        );
      for (const name of plan.unknown) console.log(`  フォルダに無い: ${name}`);

      if (plan.unknown.length > 0) {
        console.error('フォルダに無い移行が対象に含まれる（名前を確かめる）。');
        process.exit(2);
      }
      if (plan.align.length === 0) {
        console.log('揃える所は無い（記録とファイルは一致している）。');
        return;
      }

      // 承認の門と、その後の書込みまでの筋道（d927）。効果（出力・停止・書込み）は外から渡し、
      // 試験が「止まる時は書かない・中身を出す」を CLI と同じ順序で確かめられるようにする。
      await runPlanAfterApproval({
        plan,
        allowContentDiff,
        approvalRecord: argValue('approval-record'),
        apply,
        log: (message) => console.log(message),
        logError: (message) => console.error(message),
        // 停止はここで投げる（CLI 側で受け、process.exit にする）。
        stop: (code) => {
          throw new StopSignal(code);
        },
        write: async (item) =>
          client.$executeRaw`
          UPDATE _prisma_migrations SET checksum = ${item.to}
          WHERE migration_name = ${item.name} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        readContent: readMigration,
        writeRecord: (file, items) => writeApprovalRecord(file, items, readMigration),
      });
    },
  });
}

/**
 * 接続して作業し、**終わり方に関わらず接続を閉じてから**例外を外へ返す（d927）。
 *
 * 止まった時も含めて必ず閉じるため、`exit` を呼ぶのは閉じた後でなければならない。
 * 独立の目が「catch の中で process.exit を呼ぶ形に戻っても、試験が緑のままになる」と
 * 指摘したため、その順序自体をここで 1 つの関数にして試験から叩けるようにした。
 *
 * @template T
 * @param {{ connect: () => Promise<{ $disconnect: () => Promise<unknown> }>, work: (client: any) => Promise<T> }} deps
 * @returns {Promise<T>} work の結果（失敗した時は接続を閉じてから投げ直す）
 */
export async function withConnectedClient(deps) {
  const client = await deps.connect();
  try {
    return await deps.work(client);
  } finally {
    // PrismaClient は `$disconnect` で閉じる（試験でも同じ名前で差し替える）。
    await client.$disconnect();
  }
}

/**
 * 承認の門で止まった時に、その終了コードで終える（d927）。
 *
 * 接続の後始末（`disconnect`）は `withConnectedClient` が済ませてから、ここへ来る。
 * ここを関数に切り出しておくと、試験が「止まった時は異常終了する」を配線ごと確かめられる
 * （独立の目は、筋道の試験が stop を差し替えるため配線が縛れていないと指摘した）。
 *
 * @param {unknown} error main が投げたもの
 * @param {(code: number) => void} exit 停止に使う関数（CLI では process.exit）
 * @param {(error: unknown) => void} report 想定外の時に出す関数（CLI では console.error）
 */
export function handleMainError(error, exit, report) {
  if (error instanceof StopSignal) {
    exit(error.code);
    return;
  }
  report(error);
  exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) =>
    handleMainError(
      error,
      (code) => process.exit(code),
      (value) => console.error(value),
    ),
  );
}
