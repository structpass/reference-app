/**
 * `deploy/scripts/migrate-prune.sh` の判定（d984）を固定する。
 *
 * 固定する形:
 *   ① 当てない移行の一覧は「フォルダにあるのに DB に成功記録が無いもの」で、対象 1 本はその中に在る
 *   ② 巻き戻し済みの記録は「成功」に数えない（当てる候補に戻る）
 *   ③ 対象が当てる候補に無ければ、何も当てない（止まる）
 *   ④ 当面の SQL は対象 1 本だけで、記録は 1 行足し、失敗したらその行を消す
 *   ⑤ 本番 DB 名は .env.production の POSTGRES_DB から決め、既定以外の名前へは書かない（d1029）
 *   ⑥ pg_dump の成否と中身を確かめてから当てる（d1029）
 *   ⑦ 当てる・止まるの振る舞い（deploy/scripts/migrate-prune.test.sh）が緑である（d1030）
 *   ⑧ この試験が CI から走る形になっている（d1030）
 *
 * 当てる・止まるの振る舞いそのものは `deploy/scripts/migrate-prune.test.sh` が偽の git・docker で確かめる。
 * ⑦ はそれを実際に走らせる。偽物の git・docker を立てるので本番にも Docker にも触れないが、bash が要る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'deploy/scripts/migrate-prune.sh');
const MIGRATIONS = path.join(ROOT, 'packages/backend/prisma/migrations');
const TARGET = '20261031020000_drop_field_defs_updated_at_default';

const script = readFileSync(SCRIPT, 'utf8');
// 対象の移行ファイルの blob（本番の版と一致する側）。.sh と同じ判定に渡す。
const BLOB = execFileSync(
  'git',
  ['-C', ROOT, 'rev-parse', `HEAD:packages/backend/prisma/migrations/${TARGET}/migration.sql`],
  { encoding: 'utf8' },
).trim();

/**
 * bash を探す。見つからなくても、この試験は「飛ばして緑」にしない。
 * 見つからない時は下の「走る環境で必ず実行する」が赤にする。
 */
function findBash() {
  for (const candidate of ['bash', 'C:/Program Files/Git/bin/bash.exe']) {
    const probe = spawnSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const BASH = findBash();

/**
 * 見つけた bash が、spawnSync で渡した環境変数を落とす入口か。
 *
 * 環境を渡して読めたかで判定する（`WSL_DISTRO_NAME` のような特定の変数では判定しない。
 * 入口の種類で落ち方が変わるため、実際に落ちるかを見る）。この PC の `bash` は WSL の
 * 入口で、渡した変数だけが落ちる（実測: FOO・DEPLOY_ROOT は空。HOME はシェル自身の
 * 既定で入るので、判定の材料には使わない）。
 */
const BASH_DROPS_ENV =
  BASH !== null &&
  (
    spawnSync(BASH, ['-c', 'echo "$DSH_PROBE_ENV"'], {
      env: { ...process.env, DSH_PROBE_ENV: 'probe-ok' },
      encoding: 'utf8',
    }).stdout ?? ''
  ).trim() !== 'probe-ok';

/** Windows のパスを WSL で読める /mnt/<ドライブ>/… の形にする。 */
function toWsl(p) {
  const normal = p.replace(/\\/g, '/');
  const drive = /^([A-Za-z]):(.*)$/.exec(normal);
  return drive === null ? normal : `/mnt/${drive[1].toLowerCase()}${drive[2]}`;
}

/** フォルダにある移行の一覧。 */
const migrationsOnDisk = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/**
 * 当てない移行（未適用）の一覧。migrate-prune.sh の最初の判定と同じ規則。
 * @param {string[]} onDisk
 * @param {{ migration_name: string, finished_at: string | null, rolled_back_at: string | null }[]} rows
 */
export function pendingMigrations(onDisk, rows) {
  const applied = new Set(
    rows
      .filter((row) => row.finished_at != null && row.rolled_back_at == null)
      .map((row) => row.migration_name),
  );
  return onDisk.filter((name) => !applied.has(name));
}

test('未適用の移行だけを当てる候補にし、成功済みは候補にしない', () => {
  const onDisk = ['a_init', 'b_done', 'c_pending', TARGET];
  const rows = [
    { migration_name: 'a_init', finished_at: '2026-01-01T00:00:00Z', rolled_back_at: null },
    { migration_name: 'b_done', finished_at: '2026-01-02T00:00:00Z', rolled_back_at: null },
    { migration_name: 'c_pending', finished_at: null, rolled_back_at: null },
  ];
  const pending = pendingMigrations(onDisk, rows);
  assert.deepEqual(pending, ['c_pending', TARGET]);
  assert.ok(pending.includes(TARGET));
});

test('巻き戻し済みの記録は「成功」に数えない（当てる候補に戻る）', () => {
  const onDisk = [TARGET];
  const rows = [
    { migration_name: TARGET, finished_at: null, rolled_back_at: '2026-01-03T00:00:00Z' },
  ];
  assert.deepEqual(pendingMigrations(onDisk, rows), [TARGET]);
});

test('対象が当てる候補に無ければ、この道具は止まる', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.match(script, /is not pending against the production database/);
  assert.match(script, /no pending migration; nothing to do/);
});

test('当てるのは対象 1 本だけで、記録は 1 行足し、失敗したらその行を消す', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  // 当てない移行は作業用の写しから外す
  assert.ok(script.includes('rm -rf "${WORK:?}/prisma/migrations/${name:?}"'));
  // 移行は普通の配布と同じ migrate deploy で流し、1 本だけ残した写しを見せる
  assert.ok(script.includes('prisma migrate deploy --schema /prune/prisma/schema.prisma'));
  // 記録は同じ形で 1 行（先に未完了で書き、成功で finished_at を入れる）
  assert.ok(
    script.includes('INSERT INTO _prisma_migrations (checksum, finished_at, migration_name'),
  );
  assert.ok(script.includes('UPDATE _prisma_migrations SET finished_at = now()'));
  assert.ok(script.includes('DELETE FROM _prisma_migrations WHERE id ='));
  assert.match(script, /exit 1/);
  // 作業用の写しは本番の置き場の外に作り、終わったら消す
  assert.ok(script.includes('WORK=$(mktemp -d "${BACKUP_DIR%/}/d984-prune.XXXXXX")'));
  assert.ok(script.includes('trap cleanup EXIT'));
});

test('対象の移行ファイルは 1 トランザクションで、既定だけを外す', () => {
  const sql = readFileSync(path.join(MIGRATIONS, TARGET, 'migration.sql'), 'utf8');
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /ALTER TABLE public\.field_defs ALTER COLUMN "updated_at" DROP DEFAULT;/);
  assert.ok(sql.includes("SET LOCAL lock_timeout = '5s';"));
  assert.doesNotMatch(sql, /created_at/);
  assert.ok(migrationsOnDisk().includes(TARGET));
});

test('本番 DB 名は .env.production の POSTGRES_DB から決め、既定以外の名前へは書かない（d1029）', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  // 既定の structpass のような別 DB を見ない。読む値は compose と同じ既定に落とす。
  assert.match(script, /PROD_DB_DEFAULT=struct_pass_prod/);
  assert.match(script, /ENV_DB_NAME=\$\(sed -n 's\/\^POSTGRES_DB=\/\/p' "\$ENV_FILE"/);
  assert.ok(script.includes('DB_NAME=${POSTGRES_DB:-${ENV_DB_NAME:-$PROD_DB_DEFAULT}}'));
  assert.match(script, /PRUNE_ALLOW_DB_NAME/);
  assert.doesNotMatch(script, /PRUNE_DB_NAME:-structpass/);
});

test('pg_dump の成否と中身を確かめてから当てる（d1029）', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.match(
    script,
    /if ! docker exec "\$DB_CONTAINER" pg_dump -U "\$DB_USER" -d "\$DB_NAME" > "\$BACKUP"; then/,
  );
  assert.ok(script.includes('BACKUP_BYTES=$(stat -c%s "$BACKUP")'));
  assert.ok(script.includes("grep -c '^CREATE TABLE '"));
  assert.ok(script.includes('refusing to continue'));
});

test('本番の版（配布した commit）と worktree を照合し、未コミットの変更では止める（d1029）', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.ok(script.includes('.deploy-sha'));
  assert.ok(script.includes('git rev-parse "${BASELINE_SHA}^{commit}"'));
  assert.match(script, /checkout mismatch: production/);
  assert.ok(script.includes('git status --porcelain -- "$MIGRATIONS"'));
  assert.match(script, /uncommitted changes in the migrations or schema/);
  assert.match(script, /differs from the production version/);
});

test('失敗の後始末を「取り消した」と書かない（DDL はコミット済みであると明示する）（d1029）', () => {
  assert.doesNotMatch(
    script,
    /移行は BEGIN…COMMIT の 1 トランザクションなので、失敗時は対象の変更も残らない/,
  );
  assert.match(script, /the DDL is already committed/);
  const doc = readFileSync(path.join(ROOT, 'docs/operations/migration-prune.md'), 'utf8');
  assert.match(doc, /## 戻し方/);
  assert.match(doc, /--plan/);
  assert.match(doc, /POSTGRES_DB/);
});

// --- ここから下は「止まる」を文字列ではなく挙動で確かめる（d1030） -------------------------
//
// 上の試験はスクリプトの本文に語があるかだけを見ていた。語を残したまま分岐を反転させても
// 緑になってしまうので、実際に当てる判定を走らせて確かめる。本番にも Docker にも触れない:
// 偽の git・docker を差し替えたうえで、隔離した置き場で `--plan`（何も変えない）を流す。
// 振る舞いの網羅は migrate-prune.test.sh が持ち、ここは「入口として必ず止まる」側を縛る。

/** 偽の git・docker を差し込んで `migrate-prune.sh` を `--plan` で走らせる。 */
function runPlan({ envFile, deploySha, dirty, targetBlob = BLOB }) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'prune-mjs-'));
  // finally で消す置き場（置き場本体と、偽物の値を書く別の所）。
  const cleanups = [];
  try {
    // 置き場は移行・スキーマ・package.json だけを写した隔離した木にする。
    mkdirSync(path.join(sandbox, 'packages/backend/prisma'), { recursive: true });
    cpSync(MIGRATIONS, path.join(sandbox, 'packages/backend/prisma/migrations'), {
      recursive: true,
    });
    cpSync(
      path.join(ROOT, 'packages/backend/prisma/schema.prisma'),
      path.join(sandbox, 'packages/backend/prisma/schema.prisma'),
    );
    cpSync(
      path.join(ROOT, 'packages/backend/package.json'),
      path.join(sandbox, 'packages/backend/package.json'),
    );
    writeFileSync(path.join(sandbox, '.env.production'), envFile);
    if (deploySha !== undefined) writeFileSync(path.join(sandbox, '.deploy-sha'), deploySha);

    const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const dockerLog = path.join(sandbox, 'docker.log');
    writeFileSync(dockerLog, '');
    // 偽物が読む値は、置き場のファイルに書いて source させる。この PC の bash が WSL の入口だと
    // spawnSync で渡した変数が bash 側で空になる（実測: FOO・DEPLOY_ROOT）ため、
    // bash へ渡す道は BASH_DROPS_ENV で分ける（下の runner を参照）。
    //
    // 置き場は PRUNE_BACKUP_DIR の下に**置かない**。script は起点を PRUNE_BACKUP_DIR にした
    // `$ENV_FILE` を自分で source するので、同じ所に置くと値を渡す道が二重になり、
    // STUB_CASE_ENV が届かなくても通ってしまう（独立の目の指摘。それでは偽物の配置を確かめた
    // ことにならない）。別の場所に置いて、渡している道を 1 本に保つ。
    const configDir = mkdtempSync(path.join(tmpdir(), 'prune-cfg-'));
    cleanups.push(configDir);
    const caseSh = path.join(configDir, 'case.env');
    // bash から読むパスは、env を落とす入口でも届く形にそろえる（それ以外は素のまま）。
    const asBash = BASH_DROPS_ENV ? toWsl : (p) => p.replace(/\\/g, '/');
    writeFileSync(
      caseSh,
      [
        `STUB_HEAD='${head}'`,
        `STUB_BLOB='${targetBlob}'`,
        "STUB_MIGRATIONS='packages/backend/prisma/migrations'",
        `STUB_TARGET='${TARGET}'`,
        `STUB_DIRTY='${dirty ? '1' : ''}'`,
        `STUB_LOG='${asBash(dockerLog)}'`,
        `STUB_SCRIPT='${asBash(SCRIPT)}'`,
        `PRUNE_BACKUP_DIR='${asBash(sandbox)}'`,
        '',
      ].join('\n'),
    );

    const stub = `
set -Eeuo pipefail
git() {
  case "$1" in
    rev-parse)
      if [[ "$2" == "--git-dir" ]]; then return 0; fi
      if [[ "$2" == "HEAD" ]]; then echo "$STUB_HEAD"; else echo "\${2%^*}"; fi ;;
    status) if [[ -n "\${STUB_DIRTY:-}" ]]; then echo " M x"; fi ;;
    ls-tree) printf '100644 blob %s\\t%s/%s/migration.sql\\n' "$STUB_BLOB" "$STUB_MIGRATIONS" "$STUB_TARGET" ;;
    hash-object) echo "$STUB_BLOB" ;;
    *) command git "$@" ;;
  esac
}
docker() {
  echo "docker $*" >> "$STUB_LOG"
  if [[ "$*" == *"pg_dump"* ]]; then echo "CREATE TABLE public.field_defs (id text);"; return 0; fi
  if [[ "$1" == "exec" ]]; then
    case "\${*: -1}" in
      *"SELECT migration_name FROM _prisma_migrations"*) printf '%s\\n' "20261030010000_other" ;;
      *"count(*) FROM _prisma_migrations WHERE migration_name ="*) echo "0" ;;
      *) echo "" ;;
    esac
  fi
  return 0
}
source "$STUB_CASE_ENV"
source "$STUB_SCRIPT" "$STUB_TARGET" --plan
`;
    let runner;
    const run = path.join(sandbox, 'run.sh');
    writeFileSync(run, stub);
    if (BASH_DROPS_ENV) {
      // 入口が env を落とす時（この PC の WSL の bash など）は、spawnSync の env に頼らず
      // bash へ渡る引数そのものに export を書く。置き場のパスは入口から見える形に直す。
      runner = [
        `export DEPLOY_ROOT='${toWsl(sandbox)}'`,
        `export PRUNE_ALLOW_NON_ROOT=1`,
        `export STUB_CASE_ENV='${toWsl(caseSh)}'`,
        `bash '${toWsl(run)}'`,
      ].join('\n');
    } else {
      // env が通る入口（Linux の CI・Git Bash）では、そのまま渡す。
      runner = stub;
    }
    const result = spawnSync(BASH, ['-c', runner], {
      env: BASH_DROPS_ENV
        ? undefined
        : {
            PATH: process.env.PATH,
            HOME: sandbox,
            TMPDIR: sandbox,
            DEPLOY_ROOT: sandbox,
            PRUNE_ALLOW_NON_ROOT: '1',
            STUB_CASE_ENV: caseSh,
          },
      encoding: 'utf8',
    });
    return {
      code: result.status,
      out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      dockerLog: readFileSync(dockerLog, 'utf8'),
    };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  }
}

const PROD_ENV = 'POSTGRES_DB=struct_pass_prod\nPOSTGRES_USER=structpass\n';

// 振る舞いの試験は「止まった」ことだけを見るので、仕組みが壊れても（bash が無い・偽物が届かない・
// 走る前に落ちた）止まったように見えて緑になる。それを防ぐため、走らせる前に必ず
// 「前提がそろっていれば通る」を確かめ、偽物が本当に呼ばれたことまで縛る（下の最初の試験）。

test('振る舞いの試験は走る環境で必ず実行する（飛ばして緑にしない）（d1030）', () => {
  // bash が見つからない時は skip にせず赤にする。skip は node:test では緑として数えられ、
  // CI が「確かめた」ことにならないため（d1030 の独立の目の指摘）。
  assert.ok(
    BASH !== null,
    'bash が見つからない。振る舞いの試験を飛ばして緑にしない（CI には bash がある）',
  );
});

test('前提がそろっていれば --plan は何も変えずに通る（止まる側だけを縛っていない）（d1030・挙動）', () => {
  const r = runPlan({ envFile: PROD_ENV });
  assert.equal(r.code, 0, `--plan が通らない（偽物が届いていない疑い）:\n${r.out}`);
  assert.match(r.out, /plan only: nothing was changed/);
  // 偽物の docker が実際に呼ばれたことを確かめる。ここが空だと「走る前に落ちた」と
  // 「止まった」が区別できず、他の試験の緑が意味を失う。
  assert.match(
    r.dockerLog,
    /SELECT migration_name FROM _prisma_migrations/,
    `偽物の docker が呼ばれていない（試験が走っていない）:\n${r.out}`,
  );
  // --plan は写しも記録も取らない。
  assert.doesNotMatch(r.dockerLog, /pg_dump/);
  assert.doesNotMatch(r.dockerLog, /INSERT INTO/);
});

test('既定以外の DB 名では、DB に触る前に止まる（d1030・挙動）', () => {
  const r = runPlan({ envFile: 'POSTGRES_DB=structpass\nPOSTGRES_USER=structpass\n' });
  assert.notEqual(r.code, 0, '既定以外の DB 名なのに通り抜けた');
  assert.match(r.out, /refusing to write to database/);
  // 止まるのが DB に触る前であることを、docker を 1 度も呼んでいないことで見る。
  assert.equal(r.dockerLog, '', `止まる前に docker を呼んでいる:\n${r.dockerLog}`);
});

test('本番の版（.deploy-sha）が worktree と食い違えば止まる（d1030・挙動）', () => {
  const r = runPlan({
    envFile: PROD_ENV,
    deploySha: '1111111111111111111111111111111111111111\n',
  });
  assert.notEqual(r.code, 0, '.deploy-sha の食い違いを見落として通り抜けた');
  assert.match(r.out, /checkout mismatch: production/);
  assert.equal(r.dockerLog, '', '版の照合より先に DB へ触っている');
});

test('移行に未コミットの変更があれば止まる（d1030・挙動）', () => {
  const r = runPlan({ envFile: PROD_ENV, dirty: true });
  assert.notEqual(r.code, 0, '未コミットの変更を見落として通り抜けた');
  assert.match(r.out, /uncommitted changes/);
});

test('この試験は CI の migration-files ジョブから走る（d1030）', () => {
  const rootScripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.match(rootScripts['test:migrate-prune'] ?? '', /scripts\/migrate-prune\.test\.mjs/);

  // ワークフローは実行行だけを見る（コメントアウトや echo を配線と数えない）。
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  const lines = workflow.split(/\r?\n/);
  const jobsAt = lines.indexOf('jobs:');
  const executed = lines
    .slice(jobsAt === -1 ? 0 : jobsAt)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/"[^"]*"|'[^']*'/g, '""'))
    .join('\n');
  const start = lines.findIndex((line) => /^ {2}migration-files:\s*$/.test(line));
  assert.notEqual(start, -1, 'deploy.yml に migration-files ジョブが無い');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const job = lines.slice(start, end).join('\n');
  const jobExecuted = job
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/"[^"]*"|'[^']*'/g, '""'))
    .join('\n');
  assert.match(
    jobExecuted,
    /\btest:migrate-prune\b/,
    'CI の migration-files ジョブが test:migrate-prune を走らせていない',
  );
  // 実行行がコメントの中にしか無い形を、実行面の摘出で落とせることも確かめておく。
  assert.match(executed, /\btest:migration-history\b/);
});
