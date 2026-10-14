/**
 * CSV 取込機能 E2E テスト
 *
 * 対象: /dashboard/imports（商品マスタ CSV 取込）
 * spec: docs/discover/specs/2026-05-20-csv-import-design.md
 *
 * カバーするジャーニー:
 *   TC-001: ナビゲーション — サイドバー「運用管理」グループ内「ファイル取込」から遷移
 *   TC-002: 取込対象セレクタに「商品マスタ」が表示される
 *   TC-003: テンプレート CSV ダウンロードリンクが表示される
 *   TC-004: 正常 CSV + ドライラン → 見込み件数表示
 *   TC-005: 正常 CSV + 取込実行 → 確定件数表示（upsert 冪等確認）
 *   TC-006: 不正 CSV + 取込実行 → エラーテーブル + 「0 件取込」明示 + エラー CSV ダウンロードボタン
 *
 * 使い方:
 *   node packages/frontend/tests/e2e/csv-import.mjs
 *
 * 環境変数:
 *   UI_TEST_FRONTEND  (default: http://localhost:3000)
 *   UI_TEST_BACKEND   (default: http://localhost:3001)
 */

import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, withRole } from './lib/auth-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const FRONTEND = process.env.UI_TEST_FRONTEND ?? 'http://localhost:3000';
const EVIDENCE_DIR = resolve(REPO_ROOT, 'tmp/ui-test');
const FIXTURE_DIR = resolve(REPO_ROOT, 'tmp/e2e-fixtures');
const VALID_CSV = resolve(FIXTURE_DIR, 'valid-products.csv');
const INVALID_CSV = resolve(FIXTURE_DIR, 'invalid-products.csv');

mkdirSync(EVIDENCE_DIR, { recursive: true });

// ---- ユーティリティ ---- //

async function snap(page, name) {
  const path = `${EVIDENCE_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

function ok(name, msg = '') {
  console.log(`  [OK] ${name}${msg ? ' — ' + msg : ''}`);
}

function fail(name, reason) {
  console.error(`  [FAIL] ${name} — ${reason}`);
  return { name, reason };
}

/** テキストを含む要素が表示されているか確認（5 秒待機） */
async function expectText(page, text, timeout = 5000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

/** セレクタが表示されているか確認 */
async function expectVisible(page, selector, timeout = 5000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

/** URL にサブ文字列が含まれるか確認 */
async function expectUrl(page, substring, timeout = 5000) {
  await page.waitForURL((url) => url.toString().includes(substring), { timeout });
}

// ---- テストケース ---- //

/**
 * TC-001: ナビゲーション
 * サイドバーの「運用管理」グループ内「ファイル取込」リンクから /dashboard/imports に遷移できる
 */
async function tc001_navigation(page) {
  const name = 'TC-001-01';
  try {
    await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await expectUrl(page, '/dashboard');

    // サイドバーに「ファイル取込」リンクが存在する
    const link = page.locator('a[href="/dashboard/imports"]');
    await link.first().waitFor({ state: 'visible', timeout: 5000 });

    // クリックして遷移
    await link.first().click();
    await expectUrl(page, '/dashboard/imports', 8000);

    // ページタイトル確認
    await expectText(page, 'ファイル取込', 5000);
    await snap(page, `${name}-nav-success`);
    ok(name, 'サイドバー「ファイル取込」から /dashboard/imports に遷移成功');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-002: 取込対象セレクタ
 * 「商品マスタ」が取込対象ドロップダウンに表示されている
 */
async function tc002_targetSelector(page) {
  const name = 'TC-002-01';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    // SelectTrigger（aria-label="取込対象"）が表示されている
    await expectVisible(page, '[aria-label="取込対象"]', 5000);

    // デフォルト選択値が「商品マスタ」
    const triggerText = await page.locator('[aria-label="取込対象"]').first().innerText();
    if (!triggerText.includes('商品マスタ')) {
      throw new Error(`セレクタの値が「商品マスタ」ではありません: "${triggerText}"`);
    }

    await snap(page, `${name}-selector`);
    ok(name, `取込対象セレクタに「商品マスタ」が表示されている (値: "${triggerText.trim()}")`);
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-003: テンプレート CSV ダウンロードボタン
 * ダウンロードボタンが表示されている（クリック可能であること）
 */
async function tc003_templateDownload(page) {
  const name = 'TC-003-01';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    // ダウンロードボタンが表示されている
    const dlBtn = page.locator('button', { hasText: 'テンプレート CSV をダウンロード' });
    await dlBtn.first().waitFor({ state: 'visible', timeout: 5000 });

    // ボタンが enabled（disabled でない）
    const disabled = await dlBtn.first().isDisabled();
    if (disabled) {
      throw new Error('テンプレートダウンロードボタンが disabled 状態です');
    }

    await snap(page, `${name}-template-btn`);
    ok(name, 'テンプレート CSV ダウンロードボタンが表示され enabled である');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-004: 正常 CSV + ドライラン
 * 正常な CSV をアップロードして「検証のみ（ドライラン）」→ 見込み件数が表示される
 */
async function tc004_dryRun(page) {
  const name = 'TC-004-01';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    // ファイル選択
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(VALID_CSV);

    // ファイル名が表示されること（選択済み表示）
    await expectText(page, 'valid-products.csv', 3000);

    // 「検証のみ（ドライラン）」ボタンが enabled
    const dryRunBtn = page.locator('button', { hasText: '検証のみ' });
    await dryRunBtn.first().waitFor({ state: 'visible', timeout: 3000 });
    const disabled = await dryRunBtn.first().isDisabled();
    if (disabled) {
      throw new Error('「検証のみ（ドライラン）」ボタンが disabled 状態です');
    }

    await snap(page, `${name}-before-dryrun`);

    // ドライラン実行
    await dryRunBtn.first().click();

    // 見込み件数表示を待機（API 応答待ち）
    // 「検証が完了しました」または「見込み」を待つ（最大 15 秒）
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return body.includes('見込み') || body.includes('検証が完了しました');
      },
      { timeout: 15000 },
    );

    const bodyText = await page.locator('body').innerText();

    // 見込み件数の存在確認（「新規 N 件 / 更新 N 件」フォーマット）
    if (!bodyText.includes('件')) {
      throw new Error('見込み件数が表示されていません');
    }
    if (!bodyText.includes('検証が完了しました')) {
      throw new Error('「検証が完了しました」メッセージが表示されていません');
    }
    // dryRun=true 時は「取込が完了しました」ではなく「検証が完了しました」
    if (bodyText.includes('取込が完了しました')) {
      throw new Error('ドライランなのに「取込が完了しました」が表示されています');
    }

    await snap(page, `${name}-dryrun-result`);
    ok(name, '正常 CSV ドライラン成功 — 見込み件数が表示された');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-005-01: 正常 CSV + 取込実行
 * 正常な CSV をアップロードして「取込実行」→ 確定件数が表示される
 */
async function tc005_import(page) {
  const name = 'TC-005-01';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(VALID_CSV);

    await expectText(page, 'valid-products.csv', 3000);

    const importBtn = page.locator('button', { hasText: '取込実行' });
    await importBtn.first().waitFor({ state: 'visible', timeout: 3000 });

    await snap(page, `${name}-before-import`);
    await importBtn.first().click();

    await page.waitForFunction(
      () =>
        document.body.innerText.includes('取込が完了しました') ||
        document.body.innerText.includes('検証に失敗しました'),
      { timeout: 15000 },
    );

    const bodyText = await page.locator('body').innerText();

    if (!bodyText.includes('取込が完了しました')) {
      throw new Error(
        `「取込が完了しました」が表示されていません。実際: "${bodyText.slice(0, 200)}"`,
      );
    }
    if (!bodyText.includes('件')) {
      throw new Error('確定件数が表示されていません');
    }

    await snap(page, `${name}-import-result`);
    ok(name, '正常 CSV 取込実行成功 — 確定件数が表示された');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-005-02: 冪等確認（同じ CSV を再実行 → 全件 updated）
 * upsert セマンティクスにより再実行は「新規 0 件」になること
 */
async function tc005_idempotent(page) {
  const name = 'TC-005-02';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(VALID_CSV);

    const importBtn = page.locator('button', { hasText: '取込実行' });
    await importBtn.first().waitFor({ state: 'visible', timeout: 3000 });
    await importBtn.first().click();

    await page.waitForFunction(
      () =>
        document.body.innerText.includes('取込が完了しました') ||
        document.body.innerText.includes('検証に失敗しました'),
      { timeout: 15000 },
    );

    const bodyText = await page.locator('body').innerText();

    if (!bodyText.includes('取込が完了しました')) {
      throw new Error(
        `再実行で「取込が完了しました」が表示されていません。実際: "${bodyText.slice(0, 200)}"`,
      );
    }

    // 冪等確認: 同 code を再投入したので新規 0 件になること
    if (!bodyText.includes('新規 0 件')) {
      throw new Error(
        `冪等確認失敗: 「新規 0 件」が含まれていません。実際: "${bodyText.slice(0, 200)}"`,
      );
    }

    await snap(page, `${name}-idempotent-result`);
    ok(name, '冪等確認成功 — 再取込で「新規 0 件」（全件 updated）');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

/**
 * TC-006: 不正 CSV 取込 → エラーテーブル + 0 件取込 + エラー CSV ダウンロードボタン
 * 不正な CSV（不存在カテゴリー / 価格非数値）で取込実行 → all-or-nothing のため 0 件取込
 */
async function tc006_invalidCsv(page) {
  const name = 'TC-006-01';
  try {
    await page.goto(`${FRONTEND}/dashboard/imports`, { waitUntil: 'networkidle', timeout: 30000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(INVALID_CSV);

    await expectText(page, 'invalid-products.csv', 3000);

    const importBtn = page.locator('button', { hasText: '取込実行' });
    await importBtn.first().waitFor({ state: 'visible', timeout: 3000 });

    await snap(page, `${name}-before-invalid-import`);
    await importBtn.first().click();

    // エラー表示を待機（最大 15 秒）
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('0 件取込') ||
        document.body.innerText.includes('検証に失敗しました'),
      { timeout: 15000 },
    );

    const bodyText = await page.locator('body').innerText();

    // 「0 件取込」の明示
    if (!bodyText.includes('0 件取込')) {
      throw new Error(`「0 件取込」が明示されていません。実際: "${bodyText.slice(0, 300)}"`);
    }

    // エラーテーブルのヘッダー確認（行番号・列・理由）
    if (!bodyText.includes('行番号')) {
      throw new Error('エラーテーブルの「行番号」ヘッダーが表示されていません');
    }
    if (!bodyText.includes('列')) {
      throw new Error('エラーテーブルの「列」ヘッダーが表示されていません');
    }
    if (!bodyText.includes('理由')) {
      throw new Error('エラーテーブルの「理由」ヘッダーが表示されていません');
    }

    await snap(page, `${name}-error-table`);

    // エラー CSV ダウンロードボタンの確認
    const errCsvBtn = page.locator('button', { hasText: 'エラー CSV ダウンロード' });
    await errCsvBtn.first().waitFor({ state: 'visible', timeout: 5000 });
    const disabled = await errCsvBtn.first().isDisabled();
    if (disabled) {
      throw new Error('エラー CSV ダウンロードボタンが disabled 状態です');
    }

    await snap(page, `${name}-error-csv-btn`);
    ok(name, '不正 CSV → 「0 件取込」明示・エラーテーブル・エラー CSV ダウンロードボタン確認');
    return null;
  } catch (e) {
    try {
      await snap(page, `${name}-fail`);
    } catch {}
    return fail(name, e.message);
  }
}

// ---- メイン ---- //

async function main() {
  console.log('=== CSV 取込機能 E2E テスト ===');
  console.log(`frontend: ${FRONTEND}`);
  console.log(`valid CSV: ${VALID_CSV}`);
  console.log(`invalid CSV: ${INVALID_CSV}`);
  console.log(`artifacts: ${EVIDENCE_DIR}`);
  console.log('');

  const browser = await launchBrowser();
  const failures = [];

  try {
    await withRole(browser, 'ui-test-sysadmin', 'UiTest1234!', async (ctx) => {
      // TC-001: ナビゲーション
      console.log('--- TC-001: ナビゲーション遷移 ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc001_navigation(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-002: 取込対象セレクタ
      console.log('--- TC-002: 取込対象セレクタ ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc002_targetSelector(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-003: テンプレートダウンロードボタン
      console.log('--- TC-003: テンプレート CSV ダウンロードボタン ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc003_templateDownload(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-004: 正常 CSV + ドライラン
      console.log('--- TC-004: 正常 CSV + ドライラン ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc004_dryRun(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-005-01: 正常 CSV + 取込実行
      console.log('--- TC-005-01: 正常 CSV + 取込実行 ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc005_import(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-005-02: 冪等確認（TC-005-01 の後に実行）
      console.log('--- TC-005-02: 冪等確認（再実行 → 新規 0 件）---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc005_idempotent(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }

      // TC-006: 不正 CSV
      console.log('--- TC-006: 不正 CSV 取込 → エラーテーブル ---');
      {
        const page = await ctx.newPage();
        try {
          const r = await tc006_invalidCsv(page);
          if (r) failures.push(r);
        } finally {
          await page.close();
        }
      }
    });
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('=== 結果サマリー ===');
  const total = 7; // TC-001, TC-002, TC-003, TC-004, TC-005-01, TC-005-02, TC-006
  const passCount = total - failures.length;
  console.log(`pass: ${passCount} / ${total}`);
  if (failures.length > 0) {
    console.log(`fail: ${failures.length}`);
    for (const f of failures) {
      console.error(`  [FAIL] ${f.name}: ${f.reason}`);
    }
    process.exit(2);
  } else {
    console.log('全テスト pass');
  }
}

main().catch((e) => {
  console.error('runner error:', e);
  process.exit(1);
});
