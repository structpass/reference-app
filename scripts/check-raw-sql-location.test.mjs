// check-raw-sql-location.mjs の試験（d1112）。
//
// 見張りそのものが壊れると「何も検出しないまま緑」になり、規約が静かに効かなくなる。
// 使い捨ての写しを作り、規約どおりの置き方・違反・ADR 記録の 3 点を実際に走らせて確かめる。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts/check-raw-sql-location.mjs');

/** 検査を走らせる最小の写しを作る。 */
function fixture(files, adrs = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ref-raw-sql-'));
  // 作りかけで例外が出ても写しを残さない（呼び出し側の finally は dir を受け取った後しか効かない）。
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'packages/backend/src'), { recursive: true });
    mkdirSync(join(dir, 'docs/decisions'), { recursive: true });
    cpSync(SCRIPT, join(dir, 'scripts/check-raw-sql-location.mjs'));

    for (const [rel, body] of Object.entries(files)) {
      const p = join(dir, 'packages/backend/src', rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    for (const [name, body] of Object.entries(adrs)) {
      writeFileSync(join(dir, 'docs/decisions', name), body);
    }
    return dir;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function run(dir) {
  const r = spawnSync(process.execPath, [join(dir, 'scripts/check-raw-sql-location.mjs')], {
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const REPO_WITH_RAW = `export class StockRepository { async lock() { return this.prisma.$queryRaw\`SELECT 1\`; } }`;

test('Repository 内の raw SQL は通る（ADR 記録あり）', () => {
  const dir = fixture(
    { 'modules/stocks/repositories/stocks.repository.ts': REPO_WITH_RAW },
    {
      '0005-stock.md':
        'affected: packages/backend/src/modules/stocks/repositories/stocks.repository.ts',
    },
  );
  try {
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Repository の外の raw SQL は赤くなる', () => {
  const dir = fixture({
    'modules/stocks/stocks.service.ts': `export class StocksService { async bad() { return this.prisma.$queryRaw\`SELECT 1\`; } }`,
  });
  try {
    const { status, out } = run(dir);
    assert.equal(status, 1);
    assert.match(out, /Repository の外で raw SQL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Repository 内でも ADR に記録が無ければ赤くなる', () => {
  const dir = fixture({ 'modules/stocks/repositories/stocks.repository.ts': REPO_WITH_RAW });
  try {
    const { status, out } = run(dir);
    assert.equal(status, 1);
    assert.match(out, /ADR に記録がありません/);
    assert.match(out, /StockRepository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ADR がクラス名で指していても記録済みとみなす', () => {
  const dir = fixture(
    { 'modules/stocks/repositories/stocks.repository.ts': REPO_WITH_RAW },
    { '0005-stock.md': 'affected: StockRepository の ensure-row' },
  );
  try {
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('試験用の置き場（__tests__）は対象外', () => {
  // 試験の下ごしらえとして raw SQL を書くことがある。本番経路ではない。
  // 対象が 0 本だと「置き場が消えた」と判定されるため、本番側のファイルも 1 本置く。
  const dir = fixture({
    'modules/stocks/repositories/stocks.repository.ts': 'export class S { x = 1; }',
    '__tests__/helpers/setup.ts': 'export const q = (p: any) => p.$queryRaw`SELECT 1`;',
  });
  try {
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('置き場が無く 1 本も見つからない時は、静かに通さず止まる (d1128)', () => {
  // 置き場の名前が変わった・消えた時に「違反なし」で緑になると、規約が効かないまま気づけない。
  const dir = mkdtempSync(join(tmpdir(), 'ref-raw-sql-missing-'));
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'docs/decisions'), { recursive: true });
    cpSync(SCRIPT, join(dir, 'scripts/check-raw-sql-location.mjs'));
    // packages/backend/src を作らない = 置き場が無い状態
    const { status, out } = run(dir);
    assert.equal(status, 1);
    assert.match(out, /1 本も見つかりません/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
