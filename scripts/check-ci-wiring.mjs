#!/usr/bin/env node
/**
 * CI の配線検査（v2-485、v2-487 で拡張、d608 で拡張）。
 *
 * リポジトリには `test:int`（実 PostgreSQL を使う Testcontainers の統合テスト）が定義されている
 * のに、CI の `test` ジョブは `test:cov` しか走らせていなかった。そのため v2-446 / v2-463 の
 * 競合回帰が**赤くなっても CI は緑**のままで、定義した検査が実際には効いていない状態だった。
 *
 * 定義と実行は別物なので、両方を機械で見る:
 *   1. `packages/backend/package.json` の scripts に `test:int` があること
 *   2. `.github/workflows/deploy.yml` の `integration` ジョブが `test:int` を実行していること
 *   3. `deploy` が `integration` を必須の成功条件にしていること（v2-487。走らせるだけでは
 *      赤いまま配布できてしまう）
 *   4. root の `check:*` スクリプト（リポジトリの配線を守る検査）と書式検査（`format:check`）が
 *      CI の実行行として呼ばれていること（d608）
 *
 * 片方だけでは足りない（script を消しても、配線を消しても、どちらも「効かない検査」になる）。
 *
 * 実行行だけを見る（d608・独立の目の指摘）。ワークフロー本文の文字列一致で数えると、
 * 実行行をコメントアウトしただけ（`# run: …`）や `echo "pnpm run …"` でも配線と誤認する。
 * よって `jobs:` 配下の YAML のコメント行を落とし、引用符の中身を実行から除いたうえで、
 * `pnpm <name>` の呼び出しを拾う。
 *
 * ジョブの構造（branch 検証の AWS 非起動・既存検査の保持）は
 * `scripts/check-workflow-structure.mjs` が別に見る。
 *
 * 使い方: node scripts/check-ci-wiring.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopIfPublicationSnapshot } from './publication-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/deploy.yml';
const BACKEND_PKG = 'packages/backend/package.json';
const ROOT_PKG = 'package.json';

// 公開スナップショットは本番配備（deploy.yml）を持たない。配線検査は社内文脈の検査なので、
// 公開文脈では境界だけを確かめて終わる（社内では不在を赤にする・d954）。
if (stopIfPublicationSnapshot('CI 配線検査')) process.exit(0);

// 社内リポジトリに公開マーカーが残ると、本検査と仲間 3 本が境界確認へ縮退し、deploy.yml の
// 配線検査が静かに止まる。社内文脈では置かれていないことを固定する（d954）。
if (existsSync(path.join(ROOT, '.public-snapshot'))) {
  console.error(
    '.public-snapshot が社内リポジトリにあります＝公開物にだけ置くマーカーです（公開文脈の検査が縮退します）',
  );
  process.exit(1);
}

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const problems = [];

let rootScripts = {};
try {
  rootScripts = JSON.parse(read(ROOT_PKG)).scripts ?? {};
} catch (error) {
  problems.push(`${ROOT_PKG} を読めない: ${error.message}`);
}

// 1. 統合テストの script が定義されていること。
let backendScripts = {};
try {
  backendScripts = JSON.parse(read(BACKEND_PKG)).scripts ?? {};
} catch (error) {
  problems.push(`${BACKEND_PKG} を読めない: ${error.message}`);
}
if (!backendScripts['test:int']) {
  problems.push(`${BACKEND_PKG} に test:int が無い（競合回帰の実行入口が消えている）`);
}

const workflowLines = read(WORKFLOW).split(/\r?\n/);
const workflow = workflowLines.join('\n');

/** jobs: 配下のジョブ本体（`  name:` から次のジョブまで。無ければ null）。 */
function jobBody(name) {
  const start = workflowLines.findIndex((l) => new RegExp(`^ {2}${name}:\\s*$`).test(l));
  if (start === -1) return null;
  let end = workflowLines.length;
  for (let i = start + 1; i < workflowLines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(workflowLines[i])) {
      end = i;
      break;
    }
    if (/^\S/.test(workflowLines[i]) && workflowLines[i].trim() !== '') {
      end = i;
      break;
    }
  }
  return workflowLines.slice(start, end).join('\n');
}

/**
 * CI の実行面だけを取り出す（d608・独立の目の指摘を反映）。
 *
 * - `jobs:` より前の env・on などは落とす（ジョブの外の文字列は実行にならない）
 * - `#` 始まりの行（YAML のコメント）は落とす（`# run: …` を実行と数えない）
 * - 引用符の中身は落とす（`echo "pnpm run format:check"` を実行と数えない）
 */
function executedSurface(text) {
  const lines = text.split(/\r?\n/);
  const jobsAt = lines.indexOf('jobs:');
  const body = jobsAt === -1 ? lines : lines.slice(jobsAt);
  return body
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/"[^"]*"|'[^']*'/g, '""'))
    .join('\n');
}

const executed = executedSurface(workflow);

// 2. CI の integration ジョブが test:int を実行していること。
//    走らせるコマンドそのものを見る（`test:int` という語が別の語の一部として現れるだけでは
//    配線にならない。`test:int-disabled` のような改名で検査が素通りするのを防ぐ）。
const integration = jobBody('integration');
if (integration === null) {
  problems.push(`${WORKFLOW} に integration ジョブが無い（統合テストが CI で走らない）`);
} else if (
  !/--filter\s+@struct-pass\/backend\s+(?:run\s+)?test:int(\s|$)/m.test(
    executedSurface(integration),
  )
) {
  problems.push(
    `${WORKFLOW} の integration ジョブが test:int を実行していない（統合テストが CI で走らない）`,
  );
}

// 3. deploy が integration を必須の成功条件にしていること。
//    実行されているだけでは足りない（赤いまま配布できては配線として効いていない）。
const deploy = jobBody('deploy');
if (deploy !== null) {
  const m = /^\s{4}needs:\s*(.+)$/m.exec(executedSurface(deploy));
  const needs =
    m === null
      ? []
      : m[1]
          .trim()
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  if (!needs.includes('integration')) {
    problems.push(
      `${WORKFLOW} の deploy の needs に integration が無い（統合テストが赤くても配布される）`,
    );
  }
}

// 4. 統合テストの実体が在ること（script と配線だけ残ってテストが消えるのを防ぐ）。
const integrationSpecs = [
  'packages/backend/test/groups-authz-race.int-spec.ts',
  'packages/backend/test/groups-delete-race.int-spec.ts',
];
for (const spec of integrationSpecs) {
  try {
    read(spec);
  } catch {
    problems.push(`${spec} が無い（配線はあるが対象の回帰テストが消えている）`);
  }
}

// 5. リポジトリの配線を守る検査（root の check:* スクリプト）と書式検査を CI が走らせていること（d608）。
//    スクリプトを足しただけでは、手で叩く時しか効かない。実行行の無いまま `check:*` を足しても
//    この検査が赤くなる（定義と実行を同じ場所で縛る）。
const CI_SELF = 'check:ci-wiring';
const FORMAT_CHECK = 'format:check';
// 構造検査も CI で走り続けること（この検査が呼ばれているかを誰も見ていなかった。d608 の再確認）。
const STRUCTURE_CHECK = 'check-workflow-structure.mjs';
// 移行履歴の検査（d870）は DB が要るため CI では流せない（流すと「記録を読めない」で赤くなる）。
// 代わりに、この回の門は migration-files ジョブの prisma validate（移行ファイルの構文・順序・
// 効果の重なり）と test:migration-history（判定と整えの下見の回帰）が持つ。CI に流せると偽って
// 配線したままにするより、DB を使わずに流せる門で守る。
const DB_BOUND_CHECKS = new Set(['check:migration-history', 'check:migration-preconditions']);
// DB を使わずに CI で流せる回帰は、流し続けることをここで縛る。
const MIGRATION_REGRESSION = 'test:migration-history';
// E2E の前提検査を守る回帰（d928）。検査そのものは e2e ジョブが走らせるが、検査を壊す改変は
// 手元でしか赤くならなかった。同じく DB を使わないので test ジョブで流す。
const E2E_PREFLIGHT_REGRESSION = 'test:e2e-preflight';

// CI 側の実行呼び出し。1 行 1 実行として、その行に現れるスクリプト名を拾う。
// `pnpm run <name>` / `pnpm <name>` / `pnpm --filter <pkg> run <name>` / `node <script>` の形を、
// root のスクリプト名と実体のパスの両方で照合する（`node scripts/…` は CI の既存の書き方）。
const ciCalls = new Set();
const ciScriptFiles = new Set();
for (const line of executed.split(/\r?\n/)) {
  if (!/^\s*(?:-\s+)?(?:run:\s*)?.*\b(?:pnpm|node)\b/.test(line)) continue;
  // `node scripts/<file>` の実体（root スクリプトを持たない検査もここで拾う）。
  for (const match of line.matchAll(/node\s+(scripts\/[A-Za-z0-9._/-]+)/g)) {
    ciScriptFiles.add(match[1]);
  }
  for (const name of Object.keys(rootScripts)) {
    if (new RegExp(`(?:^|[\\s:])${name}(?=\\s|$)`).test(line)) ciCalls.add(name);
    const body = rootScripts[name] ?? '';
    const entry = /^node\s+(--[^\s]+\s+)*(scripts\/[A-Za-z0-9._/-]+)/.exec(body);
    if (entry !== null && line.includes(entry[2])) ciCalls.add(name);
  }
}

const checks = Object.keys(rootScripts).filter(
  (name) => name.startsWith('check:') && name !== CI_SELF,
);
if (checks.length === 0) {
  problems.push(`${ROOT_PKG} に check:* の検査が無い（配線を守る検査の入口が消えている）`);
}
for (const name of checks) {
  if (DB_BOUND_CHECKS.has(name)) continue;
  if (!ciCalls.has(name)) {
    problems.push(`${ROOT_PKG} の ${name} が CI で走っていない（手で叩く時しか効かない）`);
  }
}
if (!ciCalls.has(CI_SELF)) {
  problems.push(`${WORKFLOW} が ${CI_SELF} を走らせていない（この配線検査自身が効かない）`);
}
if (!ciCalls.has(FORMAT_CHECK)) {
  problems.push(`${WORKFLOW} が ${FORMAT_CHECK} を走らせていない（書式の低下を見逃す）`);
}
if (!ciCalls.has(STRUCTURE_CHECK) && !ciScriptFiles.has(`scripts/${STRUCTURE_CHECK}`)) {
  problems.push(`${WORKFLOW} が ${STRUCTURE_CHECK} を走らせていない（構造の検査が効かない）`);
}
// DB が要る検査を CI へ流せない代わりに、その検査を守る側を縛る（消えたら気づける）。
for (const name of DB_BOUND_CHECKS) {
  if (ciCalls.has(name)) {
    problems.push(`${ROOT_PKG} の ${name} を CI へ配線している（DB が無い CI では赤くなるだけ）`);
  }
}
const migrationJob = jobBody('migration-files') ?? '';
if (!/exec\s+prisma\s+validate/.test(executedSurface(migrationJob))) {
  problems.push(
    `${WORKFLOW} の migration-files ジョブが prisma validate を実行していない（移行ファイルの門が無い）`,
  );
}
if (!new RegExp(`\\b${MIGRATION_REGRESSION}\\b`).test(executedSurface(migrationJob))) {
  problems.push(
    `${WORKFLOW} の migration-files ジョブが ${MIGRATION_REGRESSION} を実行していない（移行履歴の判定の回帰が CI で走らない）`,
  );
}

// 6. 共有パッケージの試験が CI で走っていること（d808）。
//    試験を置いても入口を CI へ配線しなければ、手で叩く時しか効かない（他パッケージと同じ門）。
//    root の `pnpm test` は packages/** を回すが、CI はパッケージごとに入口を明示しているため、
//    共有だけ抜けても root の test が補わない（独立の目の指摘で実測）。
const sharedJob = jobBody('test') ?? '';
if (!/--filter\s+@struct-pass\/shared\s+(?:run\s+)?test(\s|$)/m.test(executedSurface(sharedJob))) {
  problems.push(
    `${WORKFLOW} の test ジョブが共有パッケージの試験を実行していない（置いた試験が CI で走らない）`,
  );
}

// 7. 画面の E2E の前提検査と、E2E 自身が CI で走っていること（d808）。
//    spec を足しただけ・前提検査を足しただけでは、手で叩く時しか効かない。
const E2E_JOB = 'e2e';
// CI で走らせる spec の全部（d864）。e2e/ 配下の *.spec.ts を数えて作る。手で並べると、
// spec を足した時に一覧へ書き忘れて「CI が全部を見ている」と確かめたことにならない。
// 読めない時は空にして、下の照合が「1 本も見ていない」として赤にする。
const E2E_DIR = 'packages/frontend/e2e';
let E2E_SPECS = [];
try {
  E2E_SPECS = readdirSync(path.join(ROOT, E2E_DIR))
    .filter((name) => name.endsWith('.spec.ts'))
    .sort()
    .map((name) => `${E2E_DIR}/${name}`);
} catch {
  E2E_SPECS = [];
}
if (E2E_SPECS.length === 0) {
  problems.push(`${E2E_DIR} に spec が 1 本も無い（画面の E2E が CI で何も見ていない）`);
}
const e2eJob = jobBody(E2E_JOB);
// 前提検査そのものは走っていても、前提検査を壊す改変は手元でしか赤くならなかった（d928）。
// 門を作る側の回帰（scripts/e2e-preflight.test.mjs）も CI で走り続けることを縛る。
// e2e ジョブではなく依存の要らない test ジョブで走らせるため、e2e ジョブの中ではなく
// ワークフロー全体（ciCalls）で見る。e2e ジョブの有無に左右されない位置に置く。
if (!ciCalls.has(E2E_PREFLIGHT_REGRESSION)) {
  problems.push(
    `${WORKFLOW} が ${E2E_PREFLIGHT_REGRESSION} を実行していない（E2E の前提検査の回帰が CI で走らない）`,
  );
}
if (e2eJob === null) {
  problems.push(`${WORKFLOW} に e2e ジョブが無い（画面の E2E が CI で走らない）`);
} else {
  const executedE2e = executedSurface(e2eJob);
  if (!/--filter\s+@struct-pass\/frontend\s+(?:run\s+)?test:e2e(\s|$)/m.test(executedE2e)) {
    problems.push(
      `${WORKFLOW} の e2e ジョブが test:e2e を実行していない（画面の E2E が CI で走らない）`,
    );
  }
  if (!/node\s+scripts\/e2e-preflight\.mjs/.test(executedE2e)) {
    problems.push(
      `${WORKFLOW} の e2e ジョブが scripts/e2e-preflight.mjs を実行していない（接続先の前提を確かめずに走らせている）`,
    );
  }
  // CI は配布と同じ形（build 済みを next start）で見る（d808 の独立の目の指摘）。
  // 配布物を作らずに開発サーバーで見ると、CSP と NODE_ENV の分岐が本番と変わり、
  // 本番の挙動を確かめたことにならない。
  if (!/--filter\s+@struct-pass\/frontend\s+(?:run\s+)?build(\s|$)/m.test(executedE2e)) {
    problems.push(
      `${WORKFLOW} の e2e ジョブがフロントエンドを build していない（next start で配布物を見られない）`,
    );
  }
}
// E2E の実体（配線だけ残って試験が消えるのを防ぐ）。読めない・1 本も無い時は赤にして、
// 「全部の spec を見ている」を空集合の上で通さない（空集合は常に条件を満たしてしまう）。
for (const spec of E2E_SPECS) {
  try {
    read(spec);
  } catch {
    problems.push(`${spec} が無い（列挙と実体がずれている）`);
  }
}
// CI が全部の spec を見ていること（d864）。以前は CI だけ portal 1 本に絞る口
// （E2E_PORTAL_ONLY）があり、対象を足したのに CI では走らない状態を作れた。
// 絞る口が戻ると CI と手元の集合がずれるので、ワークフローと設定の両方で赤にする。
const e2eSurface = jobBody(E2E_JOB) ?? '';
for (const gate of ['E2E_PORTAL_ONLY', 'testMatch', 'testIgnore', '--grep']) {
  if (e2eSurface.includes(gate)) {
    problems.push(
      `${WORKFLOW} の e2e ジョブが ${gate} で spec を絞っている（CI と手元で走る集合がずれる）`,
    );
  }
}
const playwrightConfig = read('packages/frontend/playwright.config.ts');
for (const gate of ['E2E_PORTAL_ONLY', 'testMatch', 'testIgnore']) {
  if (playwrightConfig.includes(gate)) {
    problems.push(
      `packages/frontend/playwright.config.ts が ${gate} で spec を絞っている（CI が全部を見なくなる）`,
    );
  }
}
// 全部の spec が CI 前提の形で書かれていること。SSO 化で撤去した経路を前提にした spec を
// 足すと、CI では起動の前に落ちる。土台は scripts/e2e-preflight.mjs が見るので、ここでは
// 「差し替えの部品を通っている」か「相手を自分で止めている（route で差し替えている）」の
// どちらかであることだけを数える（change-password は API を使わない経路なので後者）。
for (const spec of E2E_SPECS) {
  let body;
  try {
    body = read(spec);
  } catch {
    continue; // 無い時は上の実体の確認が赤にしている
  }
  const usesStub = /from\s+['"]\.\/helpers\/backend-stub['"]/.test(body);
  const routesOwnTraffic = /page\.route\s*\(/.test(body);
  if (!usesStub && !routesOwnTraffic) {
    problems.push(
      `${spec} が e2e/helpers/backend-stub も page.route も使っていない（CI に DB が無い前提で走る形になっていない）`,
    );
  }
}

// UI tools are maintained by an isolated browser/Excel fixture (d603).
const frontendScripts = JSON.parse(read('packages/frontend/package.json')).scripts;
for (const [name, file] of Object.entries({
  'ui:capture': 'capture-all.mjs',
  'ui:flash': 'flash-check.mjs',
  'ui:scenario': 'run-scenario.mjs',
  'test:ui-tools': 'tooling.test.mjs',
})) {
  const expected = `${name === 'test:ui-tools' ? 'node --test' : 'node'} tests/e2e/${file}`;
  if (frontendScripts[name] !== expected) problems.push(`UI tooling entry missing: ${name}`);
  read(`packages/frontend/tests/e2e/${file}`);
}
const testJob = jobBody('test') ?? '';
if (!/^\s+run: pnpm --filter @struct-pass\/frontend test:ui-tools\s*$/m.test(testJob)) {
  problems.push('test job must run test:ui-tools');
}
if (
  !/^\s+run: pnpm --filter @struct-pass\/frontend exec playwright install --with-deps chromium\s*$/m.test(
    testJob,
  )
) {
  problems.push('test job must install Chromium for UI tooling');
}

if (problems.length > 0) {
  console.error('CI 配線の検査に失敗した:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    checked: [BACKEND_PKG, WORKFLOW, ROOT_PKG, ...integrationSpecs],
    note: 'test:int の定義・integration ジョブへの配線・deploy の必須条件・root の check:* と format:check の CI 実行・対象テストの実体を確認した',
  }),
);
