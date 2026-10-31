#!/usr/bin/env node
/**
 * CI ワークフローの構造検査（v2-487）。
 *
 * `deploy.yml` の配線は「定義がある」だけでは効かない。実際に効いていたかを機械で見る:
 *
 *   1. branch / workflow_dispatch の検証経路が AWS を起動しないこと
 *      （lifecycle は main 限定。test / integration は lifecycle に依存しない）
 *   2. 統合テスト（test:int）が独立した integration ジョブで走ること
 *   3. deploy が integration を必須の成功条件にしていること
 *   4. 既存の検査（Security patches / Node 整合 / CI 配線 / 共有 EC2 lock /
 *      SSM 期限 / cleanup）が落ちていないこと
 *
 * 対象はワークフローの構造で、YAML の全構文ではない。ジョブ・needs・if の関係だけを読む。
 *
 * 使い方: node scripts/check-workflow-structure.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopIfPublicationSnapshot } from './publication-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/deploy.yml';

// 公開スナップショットは本番配備（deploy.yml）を持たない。配線検査は社内文脈の検査なので、
// 公開文脈では境界だけを確かめて終わる（社内では不在を赤にする・d954）。
if (stopIfPublicationSnapshot('CI ワークフロー構造検査')) process.exit(0);

const problems = [];
const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
const lines = workflow.split(/\r?\n/);

/** jobs: 配下のトップレベルジョブ名を取り出す（2 スペース字下げの `name:`）。 */
function jobNames() {
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) return [];
  const names = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (m) names.push(m[1]);
    else if (/^\S/.test(lines[i]) && lines[i].trim() !== '') break;
  }
  return names;
}

const jobs = jobNames();
if (jobs.length === 0) problems.push(`${WORKFLOW} の jobs を読めない`);

/** ジョブ本体（`  name:` から次のジョブまで）を返す。 */
function jobBody(name) {
  const start = lines.findIndex((l) => new RegExp(`^ {2}${name}:\\s*$`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** ジョブの needs を配列で返す（`needs: x` と `needs: [a, b]` の両方）。 */
function jobNeeds(name) {
  const body = jobBody(name);
  if (!body) return null;
  const m = /^\s{4}needs:\s*(.+)$/m.exec(body);
  if (!m) return [];
  const raw = m[1].trim();
  if (raw.startsWith('[')) {
    return raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [raw];
}

const required = ['lifecycle', 'test', 'deploy', 'health', 'login_gate', 'cleanup'];
for (const name of required) {
  if (!jobs.includes(name)) problems.push(`ジョブ ${name} が無い`);
}

// 1. branch 検証が AWS を起動しない: lifecycle は main 限定であること。
if (jobs.includes('lifecycle')) {
  const body = jobBody('lifecycle');
  const m = /^\s{4}if:\s*(.+)$/m.exec(body);
  if (!m) {
    problems.push('lifecycle に if が無い（branch 検証でも AWS を起動してしまう）');
  } else {
    const cond = m[1].trim();
    if (/workflow_dispatch/.test(cond)) {
      problems.push(
        `lifecycle の if が workflow_dispatch を許している（branch 検証が AWS を起動する）: ${cond}`,
      );
    }
    if (!/github\.ref\s*==\s*'refs\/heads\/main'/.test(cond)) {
      problems.push(`lifecycle の if が main 限定になっていない: ${cond}`);
    }
  }
}

// 2. test / integration が lifecycle に依存しないこと（branch 検証の AWS 非起動）。
for (const name of ['test', 'integration']) {
  if (!jobs.includes(name)) continue;
  const needs = jobNeeds(name);
  if (needs && needs.includes('lifecycle')) {
    problems.push(`${name} が lifecycle に依存している（branch 検証が AWS 起動を待つ）`);
  }
}

// 3. 統合テストが独立ジョブで走り、deploy の必須条件になっていること。
if (!jobs.includes('integration')) {
  problems.push('integration ジョブが無い（DB 競合回帰が CI で走らない）');
} else {
  const body = jobBody('integration');
  if (!/--filter\s+@struct-pass\/backend\s+(?:run\s+)?test:int(\s|$)/m.test(body)) {
    problems.push('integration ジョブが test:int を実行していない');
  }
  // 使い捨て DB を使う以上、Docker が使えることを先に確かめる。
  if (!/docker\s+info/.test(body)) {
    problems.push('integration ジョブに Docker readiness（docker info）が無い');
  }
  // 有限の timeout を持つこと（Testcontainers が引いて runner を占有し続けない）。
  if (!/^\s{4}timeout-minutes:\s*\d+/m.test(body)) {
    problems.push('integration ジョブに timeout-minutes が無い');
  }
  if (!/frozen-lockfile/.test(body)) {
    problems.push('integration ジョブが frozen install を使っていない');
  }
  // shared を先にビルドしないと backend の型解決が落ちる。
  if (!/--filter\s+@struct-pass\/shared\s+build/.test(body)) {
    problems.push('integration ジョブが shared をビルドしていない');
  }
  if (!/prisma\s+generate/.test(body)) {
    problems.push('integration ジョブが Prisma クライアントを生成していない');
  }
}

if (jobs.includes('deploy')) {
  const needs = jobNeeds('deploy');
  if (!needs || !needs.includes('integration')) {
    problems.push(
      `deploy の needs に integration が無い（統合テストが赤くても配布される）: ${JSON.stringify(needs)}`,
    );
  }
  if (needs && needs.includes('test') === false) {
    problems.push('deploy の needs から test が落ちている');
  }
}

// 4. 既存の検査・後始末が落ちていないこと。
//    実行行だけを見る（d637）。コメント行は実行されないため、本文の文字列一致で数えると
//    `# run: …` にコメントアウトしただけでも「落ちていない」と誤認する。
const executedBody = (name) =>
  (jobBody(name) ?? '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/"[^"]*"|'[^']*'/g, '""'))
    .join('\n');
if (jobs.includes('test')) {
  const body = executedBody('test');
  if (!/pnpm\s+run\s+format:check/.test(body))
    problems.push('test ジョブから format:check が落ちている');
  if (!/pnpm\s+test:security/.test(body))
    problems.push('test ジョブから test:security が落ちている');
  // 呼び出しは `node scripts/…` と `pnpm run check:…` の両方の書き方を認める（d608）。
  if (!/check-node-version\.mjs|pnpm\s+(?:run\s+)?check:node-version(?=\s|$)/.test(body)) {
    problems.push('test ジョブから Node 整合検査が落ちている');
  }
  if (!/check-ci-wiring\.mjs|pnpm\s+(?:run\s+)?check:ci-wiring(?=\s|$)/.test(body)) {
    problems.push('test ジョブから CI 配線検査が落ちている');
  }
}
if (jobs.includes('cleanup')) {
  const body = jobBody('cleanup');
  if (!/delete-item/.test(body)) problems.push('cleanup から共有 EC2 lock の解放が落ちている');
  if (!/release-address/.test(body)) problems.push('cleanup から EIP 返却が落ちている');
  if (!/stop-instances/.test(body)) problems.push('cleanup から EC2 停止が落ちている');
}
for (const name of ['deploy', 'health']) {
  if (!jobs.includes(name)) continue;
  const body = jobBody(name);
  if (!/executionTimeout/.test(body)) problems.push(`${name} から SSM 実行期限が落ちている`);
}

if (problems.length > 0) {
  console.error('CI ワークフローの構造検査に失敗した:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    checked: [WORKFLOW],
    jobs,
    note: 'branch 検証の AWS 非起動・integration の独立実行と deploy の必須条件・既存検査の保持を確認した',
  }),
);
