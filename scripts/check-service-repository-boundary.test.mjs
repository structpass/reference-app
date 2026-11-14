// check-service-repository-boundary.mjs の試験（d1112）。
//
// 見張りそのものが壊れると「何も検出しないまま緑」になり、依存方向の規約が静かに効かなくなる。
// 使い捨ての写しを作り、規約どおりの Service・違反・対象外を実際に走らせて確かめる。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts/check-service-repository-boundary.mjs');

/** 検査を走らせる最小の写しを作る。 */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ref-svc-boundary-'));
  // 作りかけで例外が出ても写しを残さない（呼び出し側の finally は dir を受け取った後しか効かない）。
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'packages/backend/src/modules'), { recursive: true });
    cpSync(SCRIPT, join(dir, 'scripts/check-service-repository-boundary.mjs'));

    for (const [rel, body] of Object.entries(files)) {
      const p = join(dir, 'packages/backend/src/modules', rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    return dir;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function run(dir) {
  const r = spawnSync(
    process.execPath,
    [join(dir, 'scripts/check-service-repository-boundary.mjs')],
    {
      encoding: 'utf8',
    },
  );
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

test('Repository 経由なら通る（Service が Prisma を直に使わない）', () => {
  const dir = fixture({
    'stocks/stocks.service.ts': `export class StocksService {
      constructor(private readonly repo: StocksRepository) {}
      async find() { return this.repo.findAll(); }
    }`,
  });
  try {
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Service が Prisma を直接使うと赤くなる', () => {
  const dir = fixture({
    'stocks/stocks.service.ts': `export class StocksService {
      async bad() { return this.prisma.stock.findMany(); }
    }`,
  });
  try {
    const { status, out } = run(dir);
    assert.equal(status, 1);
    assert.match(out, /Prisma Client を直接使っています/);
    assert.match(out, /stocks\.service\.ts:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('試験のファイル（.spec.ts）は対象外', () => {
  // 対象が 0 本だと「置き場が消えた」と判定されるため、本番側の Service も 1 本置く。
  const dir = fixture({
    'stocks/stocks.service.ts': 'export class StocksService { async find() { return 1; } }',
    'stocks/stocks.service.spec.ts': `it('x', async () => { await this.prisma.stock.findMany(); });`,
  });
  try {
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Service が 1 本も無い置き場では、静かに通さず止まる (d1128)', () => {
  // fixture() は何も置かないので、置き場そのものを作らない写しを手で組み立てる。
  const dir = mkdtempSync(join(tmpdir(), 'ref-svc-empty-'));
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    cpSync(SCRIPT, join(dir, 'scripts/check-service-repository-boundary.mjs'));
    // packages/backend/src/modules を作らない = 置き場が無い状態
    const { status, out } = run(dir);
    assert.equal(status, 1);
    assert.match(out, /1 本も見つかりません/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
