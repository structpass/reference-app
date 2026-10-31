/**
 * `scripts/e2e-preflight.mjs`（d808）の前提検査を、使い捨ての複製で確かめる。
 *
 * E2E を CI へ載せる前に「CI の中で何に触るか」を固定する門だが、門そのものが
 * 「崩れた版を見逃す」なら意味がない。実リポジトリは動かさず、必要なファイルだけを
 * 複製し、①現行のまま通ること ②外部のホストを向くと赤くなること ③外部の DB を
 * 向くと赤くなること ④webServer が無いと赤くなること ⑤本番の値が渡ると赤くなること
 * ⑥E2E のソースが消えると赤くなること を固定する。
 *
 * 使い方: node --test scripts/e2e-preflight.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/e2e-preflight.mjs';
const E2E_DIR = 'packages/frontend/e2e';
const CONFIG = 'packages/frontend/playwright.config.ts';
const NEXT_CONFIG = 'packages/frontend/next.config.ts';

/** 検査が実際に読みに行くファイルだけを複製した作業ツリー。 */
function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-preflight-'));
  for (const rel of [SCRIPT, E2E_DIR, CONFIG, NEXT_CONFIG]) {
    cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  return dir;
}

/** 複製した作業ツリーで検査を走らせる。環境変数は親から引き継がない（runner の値を混ぜない）。 */
function runIn(dir, env = {}) {
  const result = spawnSync(process.execPath, [path.join(dir, SCRIPT)], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

/** 複製したファイルを書き換える。 */
function rewrite(dir, rel, transform) {
  const abs = path.join(dir, rel);
  writeFileSync(abs, transform(readFileSync(abs, 'utf8')));
}

/** e2e 配下の 1 本を書き換える（対象のファイル名は現行の実リポジトリから取る）。 */
function rewriteFirstSpec(dir, transform) {
  rewrite(dir, `${E2E_DIR}/categories.spec.ts`, transform);
}

test('現行の E2E は前提を満たす', () => {
  const dir = makeFixture();
  try {
    const { status, stderr, stdout } = runIn(dir);
    assert.equal(status, 0, stderr);
    assert.equal(JSON.parse(stdout).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('外部のホストを向いた E2E は赤くなる', () => {
  const dir = makeFixture();
  try {
    rewriteFirstSpec(
      dir,
      (text) => `${text}\n// 接続先の例\nconst EXTERNAL = 'https://ref.structpass.com/api/v1';\n`,
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '外部のホストを向いているのに緑のまま');
    assert.match(stderr, /外部のホストを向いている/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('外部の DB を向いた E2E は赤くなる', () => {
  const dir = makeFixture();
  try {
    rewriteFirstSpec(
      dir,
      (text) => `${text}\nconst DB = 'postgresql://user:pass@db.example.com:5432/app';\n`,
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /外部の DB を向いている/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('コメント行の URL は接続先と数えない（説明を書けない検査にしない）', () => {
  const dir = makeFixture();
  try {
    rewriteFirstSpec(
      dir,
      (text) => `${text}\n// 本番は https://ref.structpass.com を参照する（この行は説明）\n`,
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 0, stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('webServer が無いと赤くなる（CI で相手を起動できない設定）', () => {
  const dir = makeFixture();
  try {
    rewrite(dir, CONFIG, (text) => text.replace(/^\s*webServer\s*:/m, '  fakeServer:'));
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /webServer を持たない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('本番の値が渡っていると赤くなる', () => {
  const cases = [
    {
      env: { DATABASE_URL: 'postgresql://u:p@prod-db.internal:5432/app' },
      symptom: /DATABASE_URL/,
    },
    {
      env: { NEXT_PUBLIC_API_URL: 'https://ref.structpass.com/api/v1' },
      symptom: /NEXT_PUBLIC_API_URL/,
    },
    { env: { NODE_ENV: 'production' }, symptom: /NODE_ENV=production/ },
  ];
  for (const { env, symptom } of cases) {
    const dir = makeFixture();
    try {
      const { status, stderr } = runIn(dir, env);
      assert.equal(status, 1, `${JSON.stringify(env)} で緑のまま`);
      assert.match(stderr, symptom);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('手元を向いた値は通る（試験の外へ出ない）', () => {
  const dir = makeFixture();
  try {
    const { status, stderr } = runIn(dir, {
      DATABASE_URL: 'postgresql://u:p@localhost:5433/app',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
      NODE_ENV: 'test',
    });
    assert.equal(status, 0, stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E のソースが消えると赤くなる（配線だけ残る）', () => {
  const dir = makeFixture();
  try {
    rmSync(path.join(dir, E2E_DIR), { recursive: true, force: true });
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /E2E のソースが無い/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('webServer の語があるだけでは通らない（d808 の独立の目の指摘）', () => {
  // `webServer:` が書かれていても、CI で起動済みの何かをそのまま使えば前提は崩れる。
  const cases = [
    {
      label: 'reuseExistingServer を外す',
      transform: (text) => text.replace(/^\s*reuseExistingServer:.*$/m, ''),
      symptom: /reuseExistingServer を CI で false にしていない/,
    },
    {
      label: 'reuseExistingServer: true を直書きする',
      transform: (text) =>
        text.replace(/^\s*reuseExistingServer:.*$/m, '    reuseExistingServer: true,'),
      symptom: /reuseExistingServer を CI で false にしていない/,
    },
    {
      label: '起動コマンドから next start を外す（開発サーバーで見る）',
      // 実物の形（`pnpm exec next start -p ${PORT}`）から next start の分岐だけを消し、
      // 開発サーバーの起動だけを残す。
      transform: (text) => text.replace(/next start/g, 'next dev'),
      symptom: /next start が無い/,
    },
  ];
  for (const { label, transform, symptom } of cases) {
    const dir = makeFixture();
    try {
      rewrite(dir, CONFIG, transform);
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, `${label}: 緑のまま`);
      assert.match(stderr, symptom);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('reuseExistingServer を重複して書くと赤くなる（後の値が勝つ穴・再レビューの指摘）', () => {
  // 先頭に false を置き、後ろで `!process.env.CI` を書くと、実行時は後者が効く。
  // 先頭だけを見る検査は、この並びを緑のまま通してしまう。
  const dir = makeFixture();
  try {
    rewrite(dir, CONFIG, (text) =>
      text.replace(
        /^\s*reuseExistingServer:.*$/m,
        '    reuseExistingServer: false,\n    reuseExistingServer: !process.env.CI,',
      ),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '重複した reuseExistingServer を緑のまま通した');
    assert.match(stderr, /重複して書いている/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('webServer の中の注釈で区切りが切れても、後ろの項目まで読む（再レビューの指摘）', () => {
  // 2 スペース字下げで書かれた注釈の行で block を切ると、後ろの reuseExistingServer を読まない。
  const dir = makeFixture();
  try {
    rewrite(dir, CONFIG, (text) =>
      text.replace(
        /^\s*reuseExistingServer:.*$/m,
        () => '  // 例:\n  //   url: http://localhost:3000\n    reuseExistingServer: true,',
      ),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '注釈の行で block が切れ、後ろの true を見逃した');
    assert.match(stderr, /reuseExistingServer を CI で false にしていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CI で false になる書き方以外は通さない（三項演算子・再レビューの指摘）', () => {
  // `process.env.CI ? false : true` は式としては「CI で false」だが、条件の読み違いで
  // 反転しても検査が緑のままになる。読める 1 形（!process.env.CI）だけを通す。
  const dir = makeFixture();
  try {
    rewrite(dir, CONFIG, (text) =>
      text.replace(
        /^\s*reuseExistingServer:.*$/m,
        '    reuseExistingServer: process.env.CI ? false : true,',
      ),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '三項演算子を CI で false として通した');
    assert.match(stderr, /reuseExistingServer を CI で false にしていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('入れ子の別オブジェクトの同名キーは重複として数えない（再レビューの指摘）', () => {
  // webServer 直下は正しい false、入れ子の client に同名キー。重複ではないので緑。
  const dir = makeFixture();
  try {
    rewrite(dir, CONFIG, (text) =>
      text.replace(
        /^\s*reuseExistingServer:.*$/m,
        '    reuseExistingServer: !process.env.CI,\n    client: { reuseExistingServer: true },',
      ),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 0, `重複と誤認した: ${stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('差し替える接続先がアプリの既定値と違うと赤くなる（d808 の独立の目の指摘）', () => {
  const dir = makeFixture();
  try {
    // 画面は next.config.ts の既定（localhost:3001）を叩くのに、差し替えの部品は別の接続先を掴んでいる。
    rewrite(dir, `${E2E_DIR}/helpers/backend-stub.ts`, (text) =>
      text.replace('http://localhost:3001/api/v1', 'http://localhost:3999/api/v1'),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '接続先の食い違いを見逃した');
    assert.match(stderr, /アプリの既定値（http:\/\/localhost:3001）と違う/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('差し替えの部品から接続先を受け取る spec も見る（d864）', () => {
  const dir = makeFixture();
  try {
    // 部品の外（spec 側）で接続先を掴み直しても赤くする（spec 1 本だけを見る検査にしない）。
    rewrite(
      dir,
      `${E2E_DIR}/portal.spec.ts`,
      (text) => `${text}\nconst API = 'http://localhost:3999/api/v1';\n`,
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, 'spec 側の食い違いを見逃した');
    assert.match(stderr, /portal\.spec\.ts が差し替える接続先.*と違う/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('背面を差し替える接続先がどこにも無ければ赤くなる（実物へ触る試験を緑にしない）', () => {
  const dir = makeFixture();
  try {
    rewrite(dir, `${E2E_DIR}/helpers/backend-stub.ts`, (text) =>
      text.replace(/http:\/\/localhost:3001\/api\/v1/g, 'http://localhost:3001'),
    );
    // 部品の外で接続先を掴み直した spec も合わせる（部品を持たない形の通し方を作る）。
    rewrite(dir, `${E2E_DIR}/portal.spec.ts`, (text) =>
      text.replace(/'\.\/helpers\/backend-stub'/g, "'./helpers/auth'"),
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '接続先を部品の持ち場から外した形を緑のまま通した');
    assert.match(stderr, /\/api\/v1 が付いていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
