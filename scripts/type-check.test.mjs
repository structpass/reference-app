// テストの型検査が本当にテストも見ているか（d574）、そしてその検査自身が CI で走っているか（d637）。
// `type-check`（tsc --noEmit）は各パッケージの tsconfig.json を使う。バックエンドの tsconfig は
// test/ を exclude しているため、テストの型崩れ（d10 の 16 件）は type-check を素通りする。
// よって「テストを含む型検査を持ち、CI の test ジョブが依存の生成後にそれを走らせる」ことを、
// 定義と実行の両面で固定する（定義だけ・配線だけでは効かない検査になる）。
//
// この検査は当初 root の `pnpm test` の外（packages/** のみ）にあり、CI からも呼ばれていなかった。
// 手元で叩く時しか効かない門になっていたため、CI の test ジョブが `test:type-check` で
// この検査自身を走らせることを未満で固定する。
//
// 実行: node --test scripts/type-check.test.mjs

import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_PUBLICATION_SNAPSHOT } from './publication-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/deploy.yml';

// 公開スナップショットは本番配備（deploy.yml）を持たない。この試験は社内 CI の配線を確かめるものなので、
// 公開文脈では境界（deploy.yml が入っていないこと）だけを 1 本で固定し、残りは登録しない（d954）。
if (IS_PUBLICATION_SNAPSHOT) {
  nodeTest('公開スナップショットは本番配備（deploy.yml）を持たない', () => {
    assert.equal(
      existsSync(path.join(ROOT, WORKFLOW)),
      false,
      `${WORKFLOW} が公開物に入っています＝公開スナップショットは配備を持たない境界です`,
    );
  });
}
const test = IS_PUBLICATION_SNAPSHOT ? () => {} : nodeTest;

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

/** deploy.yml の test ジョブの本体（`  test:` から次のジョブまで）。 */
function testJob() {
  const lines = read(WORKFLOW).split(/\r?\n/);
  const start = lines.findIndex((l) => /^ {2}test:\s*$/.test(l));
  assert.notEqual(start, -1, `${WORKFLOW} に test ジョブが無い`);
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

const FRONTEND = 'packages/frontend/package.json';
const BACKEND = 'packages/backend/package.json';
const BACKEND_TEST_TSCONFIG = 'packages/backend/tsconfig.test.json';

// - で始まる行だけを見る（コメント行に同じ語が出ているだけで配線と数えない。d637 で実測）。
const RUN_LINES = (job) =>
  job
    .split(/\r?\n/)
    .filter((line) => /^\s+-\s|^\s+run:/.test(line))
    .join('\n');

test('フロントエンドの type-check はテストも型検査する（d574）', () => {
  const tsconfig = json('packages/frontend/tsconfig.json');
  const include = (tsconfig.include ?? []).join(' ');
  const exclude = (tsconfig.exclude ?? []).join(' ');
  assert.match(include, /\*\*\/\*\.tsx?/, 'tsconfig の include が全 .ts/.tsx を拾っていない');
  assert.doesNotMatch(exclude, /__tests__/, '__tests__ を型検査から外している');
  assert.match(json(FRONTEND).scripts['type-check'], /tsc/, 'フロントエンドに型検査の入口が無い');
});

test('バックエンドはテスト専用の型検査を持ち、テストを含む（d574）', () => {
  const tsconfig = json(BACKEND_TEST_TSCONFIG);
  const include = (tsconfig.include ?? []).join(' ');
  const exclude = (tsconfig.exclude ?? []).join(' ');
  assert.match(include, /test\/\*\*\/\*/, `${BACKEND_TEST_TSCONFIG} がテストを拾っていない`);
  assert.doesNotMatch(exclude, /\btest\b/, `${BACKEND_TEST_TSCONFIG} がテストを除外している`);
  assert.equal(tsconfig.compilerOptions?.noEmit, true, '型検査の入口として noEmit で走らせる');
});

test('共有パッケージもテスト込みの型検査を持つ（d808）', () => {
  // 共有パッケージの試験は build（tsconfig.json）から除外している。テスト込みの型検査を
  // 別に持たないと、試験の型崩れを誰も見ないまま本番の型検査だけが緑になる。
  const shared = 'packages/shared/package.json';
  assert.match(
    json(shared).scripts['type-check:test'] ?? '',
    /tsc\s+--noEmit/,
    `${shared} にテスト込みの型検査の入口が無い`,
  );
  const tsconfig = json('packages/shared/tsconfig.test.json');
  assert.equal(tsconfig.compilerOptions?.noEmit, true, '共有の型検査は noEmit で走らせる');
  assert.doesNotMatch(
    (tsconfig.exclude ?? []).join(' '),
    /test\.ts/,
    '共有の型検査がテストを除外している',
  );
});

test('CI の test ジョブが型検査を走らせる（d574）', () => {
  const job = testJob();
  const steps = job.split(/\r?\n\s+- /).map((s) => s.trim());
  const indexOf = (pattern) => steps.findIndex((s) => pattern.test(s));

  const prisma = indexOf(/prisma generate/);
  const sharedBuild = indexOf(/@struct-pass\/shared build/);
  const frontendType = indexOf(/--filter\s+@struct-pass\/frontend\s+(?:run\s+)?type-check/);
  const backendType = indexOf(/--filter\s+@struct-pass\/backend\s+(?:run\s+)?type-check[:\w-]*/);

  assert.notEqual(frontendType, -1, 'CI がフロントエンドの型検査を走らせていない');
  assert.notEqual(backendType, -1, 'CI がバックエンドの型検査を走らせていない');
  assert.ok(
    prisma !== -1 && prisma < backendType,
    'バックエンドの型検査は Prisma Client の生成より後',
  );
  assert.ok(
    sharedBuild !== -1 && sharedBuild < frontendType,
    'フロントエンドの型検査は shared の build より後',
  );

  // 共有パッケージのテスト込みの型検査も CI で走ること（d808）。
  assert.notEqual(
    indexOf(/--filter\s+@struct-pass\/shared\s+(?:run\s+)?type-check:test/),
    -1,
    'CI が共有パッケージのテスト込みの型検査を走らせていない',
  );

  const backendLine = steps[backendType];
  if (/type-check:test/.test(backendLine)) {
    assert.ok(
      existsSync(path.join(ROOT, BACKEND_TEST_TSCONFIG)),
      `${BACKEND_TEST_TSCONFIG} が無い`,
    );
  } else {
    assert.fail('バックエンドの型検査はテストを含む入口（type-check:test）を使う');
  }
});

test('フロントエンドのテストコマンドが TZ=UTC を固定する（型検査と実行の前提を揃える）', () => {
  assert.match(
    json(FRONTEND).scripts['test:cov'],
    /TZ=UTC/,
    'CI の test:cov と手元の型検査で前提の時刻帯がずれる',
  );
});

test('この検査自身が CI の test ジョブで走っている（d637）', () => {
  // 実行行だけを見る。`type-check:test` はコメントにも現れるため、本文全体の一致では配線を誤認する。
  const runs = RUN_LINES(testJob());
  assert.match(
    runs,
    /pnpm\s+(?:run\s+)?test:type-check(?=\s|$)/m,
    'CI が scripts/type-check.test.mjs を走らせていない（手元で叩く時しか効かない門）',
  );
  assert.match(
    json('package.json').scripts['test:type-check'] ?? '',
    /node --test scripts\/type-check\.test\.mjs/,
    'root に型検査テストの入口（test:type-check）が無い',
  );
});
