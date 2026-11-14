/**
 * `scripts/check-ci-wiring.mjs` の root 検査配線（d608）を、途中まで消した使い捨ての複製で確かめる。
 *
 * 本検査は CI の test ジョブで走るが、検査自身が「定義と実行のずれ」を見つけられるかを
 * 確かめる試験は持っていなかった。実リポジトリの配線は動かさず、必要最小限の複製を作り、
 * ①現行のまま通ること ②root の検査の呼び出しが CI から消えると赤くなること
 * ③書式検査の呼び出しが消えると赤くなること ④配線検査自身の呼び出しが消えると赤くなること
 * ⑤root の check:* を足しても CI に配線しなければ赤くなること を固定する。
 *
 * ②④⑤では、消した検査自身（check-workflow-structure / check-ci-wiring）が他の検査で
 * 引っかかって結論を隠さないよう、複製の scripts/ から先に外す。
 *
 * 使い方: node --test scripts/check-ci-wiring.test.mjs
 */
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_PUBLICATION_SNAPSHOT } from './publication-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/check-ci-wiring.mjs';
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

/**
 * 実リポジトリの必要ファイルだけを複製した作業ツリーを作る。
 * これは検査（scripts/check-ci-wiring.mjs）が実際に読みに行くファイルだけ。
 * UI ツールは入口の実在だけを検査するため、その4ファイルも複製する。
 */
function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-wiring-'));
  for (const rel of [
    'package.json',
    'scripts',
    WORKFLOW,
    'packages/backend/package.json',
    'packages/backend/test/groups-authz-race.int-spec.ts',
    'packages/backend/test/groups-delete-race.int-spec.ts',
    'packages/frontend/package.json',
    'packages/frontend/tests/e2e/capture-all.mjs',
    'packages/frontend/tests/e2e/flash-check.mjs',
    'packages/frontend/tests/e2e/run-scenario.mjs',
    'packages/frontend/tests/e2e/tooling.test.mjs',
    // 画面の E2E の実体（d808・d864）。配線はあるが試験が消えた状態を検査が拾えるよう、
    // 複製にも入れておく（消す側の試験が自前で rm する）。
    'packages/frontend/e2e/portal.spec.ts',
    'packages/frontend/e2e/categories.spec.ts',
    'packages/frontend/e2e/product-category-dropdown.spec.ts',
    'packages/frontend/e2e/change-password.spec.ts',
    // CI が spec を絞っていないことを見るので、設定も複製する。
    'packages/frontend/playwright.config.ts',
    'scripts/e2e-preflight.mjs',
  ]) {
    cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  return dir;
}

/** 複製した作業ツリーで検査を走らせ、終了コードと stderr を返す。 */
function runIn(fixture) {
  const result = spawnSync(process.execPath, [path.join(fixture, SCRIPT)], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr ?? '' };
}

/** 作業ツリーのファイルを書き換える。 */
function rewrite(dir, rel, transform) {
  const abs = path.join(dir, rel);
  writeFileSync(abs, transform(readFileSync(abs, 'utf8')));
}

/** CI から、指定した文字列を含む行（step・name・run）だけを外す。 */
function dropCiLines(dir, includes) {
  rewrite(dir, WORKFLOW, (text) =>
    text
      .split(/\r?\n/)
      .filter((line) => !includes.some((needle) => line.includes(needle)))
      .join('\n'),
  );
}

test('現行の配線は通る', () => {
  const dir = makeFixture();
  try {
    const { status, stderr } = runIn(dir);
    assert.equal(status, 0, stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** CI の各行を、条件に合う行だけ書き換える。 */
function transformCiLines(dir, predicate, transform) {
  rewrite(dir, WORKFLOW, (text) =>
    text
      .split(/\r?\n/)
      .map((line) => (predicate(line) ? transform(line) : line))
      .join('\n'),
  );
}

/**
 * 1 本の呼び出しをコメントアウトする。同じ検査は test ジョブと integration ジョブの両方に
 * 置かれている（check-node-version）ため、全箇所を消さないと片方が残って緑になる。
 */
function commentOutEverywhere(dir, comment) {
  transformCiLines(
    dir,
    (line) =>
      line.includes(comment) &&
      /^\s+(-\s|run:)/.test(line) &&
      // step の見出し行（`- name: …`）は残したいので、実行行だけを対象にする
      !/^\s+-\s+name:/.test(line),
    (line) => `# ${line.trim()}`,
  );
}

/**
 * 配線の根拠が残らないように整える。integration ジョブにも check-node-version があり、
 * そこが残っていると配線の検出だけを確かめられないため、複製からは integration ジョブを外す
 * （ジョブを外すこと自体は、この試験の対象外）。
 */
function isolateTestJob(dir) {
  rewrite(dir, WORKFLOW, (text) => {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => /^ {2}integration:\s*$/.test(l));
    if (start === -1) return text;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
  });
  rmSync(path.join(dir, 'scripts/check-workflow-structure.mjs'), { force: true });
}

test('実行行をコメントアウトしただけでは素通りしない（d608 の独立の目の指摘）', () => {
  // コメント行は YAML として実行されない。ワークフロー本文の文字列一致で数えると緑になる穴。
  // package.json の check:* は「CI で走っていない」、CI 直書きの検査は「走らせていない」と出る。
  const cases = {
    format: { comment: 'format:check', symptom: 'が format:check を走らせていない' },
    self: { comment: 'check:ci-wiring', symptom: 'が check:ci-wiring を走らせていない' },
    root: { comment: 'check-node-version', symptom: 'check:node-version が CI で走っていない' },
  };
  for (const { comment, symptom } of Object.values(cases)) {
    const dir = makeFixture();
    try {
      isolateTestJob(dir);
      commentOutEverywhere(dir, comment);
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, `${comment} の実行行をコメントアウトしたのに緑のまま`);
      assert.equal(stderr.includes(symptom), true, stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('構造検査の実行行も配線として見る（d608 の再確認）', () => {
  const dir = makeFixture();
  try {
    // 構造検査は root のスクリプトではなく `node scripts/check-workflow-structure.mjs` で呼ばれる。
    commentOutEverywhere(dir, 'check-workflow-structure.mjs');
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '構造検査の実行行を消したのに緑のまま');
    assert.equal(stderr.includes('check-workflow-structure.mjs を走らせていない'), true, stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('呼び出しを echo に置き換えると素通りしない', () => {
  const dir = makeFixture();
  try {
    transformCiLines(
      dir,
      (line) => /^\s+run: pnpm run format:check\s*$/.test(line),
      () => '        run: echo "pnpm run format:check"',
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /format:check を走らせていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('root の検査（check:node-version）の呼び出しが CI から消えると赤くなる', () => {
  const dir = makeFixture();
  try {
    rmSync(path.join(dir, 'scripts/check-workflow-structure.mjs'), { force: true });
    dropCiLines(dir, ['check-node-version', 'Node version consistency']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /check:node-version が CI で走っていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('書式検査の呼び出しが CI から消えると赤くなる', () => {
  const dir = makeFixture();
  try {
    dropCiLines(dir, ['format:check', 'Format check']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /format:check を走らせていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('配線検査自身の呼び出しが CI から消えると赤くなる', () => {
  const dir = makeFixture();
  try {
    rmSync(path.join(dir, 'scripts/check-workflow-structure.mjs'), { force: true });
    dropCiLines(dir, ['check:ci-wiring', 'CI wiring consistency']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /check:ci-wiring を走らせていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('共有パッケージの試験が CI から消えると赤くなる（d808 の再レビューの指摘）', () => {
  // 試験を置いても test ジョブの入口を外せば CI では走らない。置いたことと走ることを縛る。
  const dir = makeFixture();
  try {
    dropCiLines(dir, ['--filter @struct-pass/shared test']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /共有パッケージの試験を実行していない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('共有パッケージの試験の型検査が CI から消えると赤くなる（d1052）', () => {
  // TESTING_STRATEGY.md は試験と型検査の両方が配線されている前提で書かれているのに、
  // 型検査の実行行だけ見張られておらず、消えても緑のままだった。
  const dir = makeFixture();
  try {
    dropCiLines(dir, ['--filter @struct-pass/shared type-check:test']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /shared の type-check:test を実行していない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('型検査の実行行が CI から消えると赤くなる（d1073）', () => {
  // backend と frontend の型検査は、型の誤りを配布へ通さない門。実行行を echo に
  // 差し替えても他の検査が緑のままだったので、中身まで見張る。
  const cases = [
    ['backend', 'type-check:test'],
    ['frontend', 'type-check'],
  ];
  for (const [pkg, script] of cases) {
    const dir = makeFixture();
    try {
      dropCiLines(dir, [`--filter @struct-pass/${pkg} ${script}`]);
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, `${pkg} の ${script} を消しても緑のまま`);
      assert.match(stderr, new RegExp(`${pkg} の ${script} を実行していない`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('被覆率を縛る test:cov が CI から消えると赤くなる（d1072）', () => {
  // vitest.config.ts の coverage.thresholds は test:cov でしか効かない。実行行が消えても
  // 他が緑のままだと、下限が黙って外れる。両パッケージぶんを見る。
  for (const pkg of ['backend', 'frontend']) {
    const dir = makeFixture();
    try {
      dropCiLines(dir, [`--filter @struct-pass/${pkg} test:cov`]);
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, `${pkg} の test:cov を消しても緑のまま`);
      assert.match(stderr, new RegExp(`${pkg} の test:cov を実行していない`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('画面の E2E のジョブが CI から消えると赤くなる（d808）', () => {
  const dir = makeFixture();
  try {
    // e2e ジョブだけを丸ごと外す。
    rewrite(dir, WORKFLOW, (text) => {
      const lines = text.split(/\r?\n/);
      const start = lines.findIndex((l) => /^ {2}e2e:\s*$/.test(l));
      if (start === -1) return text;
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
          end = i;
          break;
        }
      }
      return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
    });
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /e2e ジョブが無い/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E の前提検査の実行行が消えると赤くなる（d808）', () => {
  const dir = makeFixture();
  try {
    dropCiLines(dir, ['e2e-preflight.mjs', 'E2E preflight']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /e2e-preflight\.mjs を実行していない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E ジョブがフロントエンドを build しないと赤くなる（d808 の独立の目の指摘）', () => {
  const dir = makeFixture();
  try {
    // e2e ジョブの build 行だけを外す（test ジョブの build は残す＝対象を e2e に限る）。
    rewrite(dir, WORKFLOW, (text) => {
      const lines = text.split(/\r?\n/);
      const start = lines.findIndex((l) => /^ {2}e2e:\s*$/.test(l));
      if (start === -1) return text;
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
          end = i;
          break;
        }
      }
      const kept = lines.slice(start, end).filter((l) => !/frontend\s+build/.test(l));
      return [...lines.slice(0, start), ...kept, ...lines.slice(end)].join('\n');
    });
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /フロントエンドを build していない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CI は配布と同じ形（build 済みを next start）で E2E を走らせる', () => {
  // 規約そのものを固定する（開発サーバーで見ると CSP と NODE_ENV の分岐が本番と変わる）。
  const config = readFileSync(path.join(ROOT, 'packages/frontend/playwright.config.ts'), 'utf8');
  // 書式（引用符の種類・改行の位置）に依存しないよう、CI の分岐と next start の組み合わせを見る。
  const ciCommand = /command:\s*process\.env\.CI\s*\?\s*`?([^`'"]+)`?/.exec(config);
  assert.ok(ciCommand !== null, 'webServer.command が CI の分岐になっていない');
  assert.match(ciCommand[1], /next start/, 'CI の webServer が next start（配布物）になっていない');
});

test('e2e/ の spec を全部消すと赤くなる（空集合の上で「全部見ている」を通さない・d864）', () => {
  // 一覧は e2e/ の実体から作るので、「1 本消した」は列挙の側も減って何も検出しない。
  // 空になった時に赤くなることを確かめる（条件が空集合の上で真になるのを防ぐ）。
  const dir = makeFixture();
  try {
    for (const spec of ['portal', 'categories', 'product-category-dropdown', 'change-password']) {
      rmSync(path.join(dir, `packages/frontend/e2e/${spec}.spec.ts`), { force: true });
    }
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, 'spec を全部消しても緑のまま');
    assert.match(stderr, /spec が 1 本も無い/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CI が E2E の spec を絞る口を戻すと赤くなる（d864）', () => {
  // ① ワークフローの e2e ジョブへ、絞る環境変数を戻した状態を再現する。
  {
    const dir = makeFixture();
    try {
      // TZ: UTC の行は 2 か所（test:cov の step と e2e の step）にある。e2e の step は後ろに
      // あるので、貪欲な正規表現で最後の 1 つを狙う（その直後へ env を足す）。
      rewrite(dir, WORKFLOW, (text) =>
        text.replace(
          /([\s\S]*)\n {10}TZ: UTC\n/,
          (m, head) =>
            `${head}\n          TZ: UTC\n` +
            '          # CI は配布の入口（e2e/portal.spec.ts）だけを見る\n' +
            "          E2E_PORTAL_ONLY: '1'\n",
        ),
      );
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, 'ワークフローに絞る口を戻しても緑のまま');
      assert.match(stderr, /絞っている/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // ② 設定側の testMatch を戻した状態を再現する。
  {
    const dir = makeFixture();
    try {
      rewrite(dir, 'packages/frontend/playwright.config.ts', (text) =>
        text.replace(/( {2}testDir: '\.\/e2e',\n)/, '$1  testMatch: /.*portal\\.spec\\.ts$/,\n'),
      );
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1, '設定に絞る口を戻しても緑のまま');
      assert.match(stderr, /絞っている/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('spec が相手を差し替えない形へ戻ると赤くなる（CI に DB が無い前提・d864）', () => {
  const dir = makeFixture();
  try {
    // 差し替えの部品も page.route も無い形（撤去済みのログイン入力を使う旧 spec の形）。
    rewrite(
      dir,
      'packages/frontend/e2e/categories.spec.ts',
      () =>
        "import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.goto('/'); });\n",
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /categories\.spec\.ts が e2e\/helpers\/backend-stub も page\.route も使っていない/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('root の check:* を足しても CI に配線しなければ赤くなる', () => {
  const dir = makeFixture();
  try {
    rmSync(path.join(dir, 'scripts/check-workflow-structure.mjs'), { force: true });
    rewrite(dir, 'package.json', (text) => {
      const pkg = JSON.parse(text);
      pkg.scripts['check:brand-new'] = 'node scripts/check-brand-new.mjs';
      writeFileSync(path.join(dir, 'scripts/check-brand-new.mjs'), 'process.exit(0);\n');
      return JSON.stringify(pkg, null, 2);
    });
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /check:brand-new が CI で走っていない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('e2e/ に spec を足すと、一覧へ書き足さなくても検査の対象になる（d864）', () => {
  // 一覧を手で持つと、足した spec が CI で走るかを確かめたことにならない（独立の目の指摘）。
  // 足した spec を「差し替えの無い形」にしておき、それが赤くなれば、検査が新顔も数えている。
  const added = 'packages/frontend/e2e/zz-added.spec.ts';
  const dir = makeFixture();
  try {
    writeFileSync(
      path.join(dir, added),
      "import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.goto('/'); });\n",
    );
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '足した spec が検査の対象になっていない');
    assert.match(
      stderr,
      /zz-added\.spec\.ts が e2e\/helpers\/backend-stub も page\.route も使っていない/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E の前提検査の回帰が CI から消えると赤くなる（d928）', () => {
  // 前提検査そのものは e2e ジョブが走らせていたが、前提検査を壊す改変は手元でしか赤くならなかった。
  // 回帰の実行行を消した時に配線検査が赤くならなければ、また同じ穴が開く。
  const dir = makeFixture();
  try {
    rmSync(path.join(dir, 'scripts/check-workflow-structure.mjs'), { force: true });
    dropCiLines(dir, ['test:e2e-preflight', 'E2E preflight regression']);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1, '前提検査の回帰の実行行を消したのに緑のまま');
    assert.match(stderr, /test:e2e-preflight を実行していない/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('この検査自身が CI の test ジョブで走っている（d1076）', () => {
  // 配線検査が有効かどうかは、この試験が CI で走って初めて分かる。実行行を消されても
  // 他の検査は緑のままだったので、型検査の試験（type-check.test.mjs）と同じ自己確認を置く。
  // 実行行だけを見る（コメントにも test:ci-wiring が現れるため、本文全体では誤認する）。
  const yaml = readFileSync(new URL(`../${WORKFLOW}`, import.meta.url), 'utf8');
  const runLines = yaml
    .split(/\r?\n/)
    .filter((l) => /^\s*run:/.test(l))
    .join('\n');
  assert.match(
    runLines,
    /pnpm\s+(?:run\s+)?test:ci-wiring(?=\s|$)/m,
    'CI が scripts/check-ci-wiring.test.mjs を走らせていない（配線の見張りが試されない）',
  );
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(
    pkg.scripts['test:ci-wiring'] ?? '',
    /node --test scripts\/check-ci-wiring\.test\.mjs/,
    'root に配線検査テストの入口（test:ci-wiring）が無い',
  );
});
