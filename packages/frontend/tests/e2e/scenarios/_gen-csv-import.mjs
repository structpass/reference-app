/**
 * CSV 取込機能 E2E シナリオ生成スクリプト
 *
 * 生成物: scenarios/csv-import-2026-05-20.xlsx
 *
 * カバーするジャーニー:
 *   TC-001: ナビゲーション — サイドバー「運用管理」グループから /dashboard/imports に遷移
 *   TC-002: 取込対象セレクタ — 「商品マスタ」が表示されている
 *   TC-003: テンプレート CSV ダウンロードリンク表示確認
 *   TC-004: 正常 CSV + ドライラン → 見込み件数表示
 *   TC-005: 正常 CSV + 取込実行 → 確定件数表示（冪等 upsert）
 *   TC-006: 不正 CSV + 取込実行 → 行番号・列・理由テーブル + 「0 件取込」明示 + エラー CSV ダウンロードボタン
 *
 * 使い方:
 *   node packages/frontend/tests/e2e/scenarios/_gen-csv-import.mjs
 */

import ExcelJS from 'exceljs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, 'csv-import-2026-05-20.xlsx');

// ---- シナリオ定義 ---- //
// stepNo は同じ patternId 内で連番
// precondRole は 'SYS_ADMIN' を使用 (ui-test-sysadmin は file-import 権限あり)

const rows = [
  // ===== TC-001: ナビゲーション遷移 =====
  {
    scenarioId: 'TC-001',
    scenarioName: 'ナビゲーション遷移',
    patternId: 'TC-001-01',
    patternName: 'サイドバー「ファイル取込」からページ遷移',
    precondRole: 'SYS_ADMIN',
    precondData: 'ログイン済み（ui-test-sysadmin）',
    stepNo: 1,
    operation: 'goto: /dashboard',
    expected: 'expectUrl: /dashboard',
    judgeMethod: 'dom',
    note: 'ダッシュボードから開始',
  },
  {
    scenarioId: 'TC-001',
    scenarioName: 'ナビゲーション遷移',
    patternId: 'TC-001-01',
    patternName: 'サイドバー「ファイル取込」からページ遷移',
    precondRole: 'SYS_ADMIN',
    precondData: 'ログイン済み（ui-test-sysadmin）',
    stepNo: 2,
    operation: 'click: a[href="/dashboard/imports"]',
    expected: 'expectUrl: /dashboard/imports; expectVisible: h1:has-text("ファイル取込")',
    judgeMethod: 'both',
    note: 'サイドバーの「ファイル取込」リンクをクリックして遷移を確認',
  },

  // ===== TC-002: 取込対象セレクタ =====
  {
    scenarioId: 'TC-002',
    scenarioName: '取込対象セレクタ',
    patternId: 'TC-002-01',
    patternName: '商品マスタが選択肢に表示されている',
    precondRole: 'SYS_ADMIN',
    precondData: '/dashboard/imports を開いた状態',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: [aria-label="取込対象"]',
    judgeMethod: 'dom',
    note: '取込対象セレクタ（SelectTrigger）が表示されていること',
  },
  {
    scenarioId: 'TC-002',
    scenarioName: '取込対象セレクタ',
    patternId: 'TC-002-01',
    patternName: '商品マスタが選択肢に表示されている',
    precondRole: 'SYS_ADMIN',
    precondData: '/dashboard/imports を開いた状態',
    stepNo: 2,
    operation: 'waitFor: [aria-label="取込対象"]',
    expected: 'expectText: [aria-label="取込対象"] = 商品マスタ',
    judgeMethod: 'both',
    note: 'デフォルト選択が「商品マスタ」であること',
  },

  // ===== TC-003: テンプレート CSV ダウンロードボタン =====
  {
    scenarioId: 'TC-003',
    scenarioName: 'テンプレート CSV ダウンロードボタン',
    patternId: 'TC-003-01',
    patternName: 'ダウンロードボタンが表示されている',
    precondRole: 'SYS_ADMIN',
    precondData: '/dashboard/imports を開いた状態',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: button:has-text("テンプレート CSV をダウンロード")',
    judgeMethod: 'both',
    note: 'テンプレートダウンロードボタンが存在すること',
  },

  // ===== TC-004: 正常 CSV + ドライラン =====
  {
    scenarioId: 'TC-004',
    scenarioName: '正常 CSV ドライラン',
    patternId: 'TC-004-01',
    patternName: '正常 CSV で検証のみ実行 → 見込み件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: input[type="file"]',
    judgeMethod: 'dom',
    note: 'ページが開いていること',
  },
  {
    scenarioId: 'TC-004',
    scenarioName: '正常 CSV ドライラン',
    patternId: 'TC-004-01',
    patternName: '正常 CSV で検証のみ実行 → 見込み件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 2,
    operation: 'fill: input[type="file"] = __FIXTURE_VALID_CSV__',
    expected: 'expectVisible: button:has-text("検証のみ")',
    judgeMethod: 'dom',
    note: 'ファイル選択後、ドライランボタンが有効になること',
  },
  {
    scenarioId: 'TC-004',
    scenarioName: '正常 CSV ドライラン',
    patternId: 'TC-004-01',
    patternName: '正常 CSV で検証のみ実行 → 見込み件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 3,
    operation: 'click: button:has-text("検証のみ")',
    expected: 'expectVisible: text=見込み; expectVisible: text=件',
    judgeMethod: 'both',
    note: '見込み件数（「新規 N 件 / 更新 N 件」）が表示されること',
  },

  // ===== TC-005: 正常 CSV + 取込実行（冪等確認）=====
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-01',
    patternName: '正常 CSV で取込実行 → 確定件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: input[type="file"]',
    judgeMethod: 'dom',
    note: 'ページが開いていること',
  },
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-01',
    patternName: '正常 CSV で取込実行 → 確定件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 2,
    operation: 'fill: input[type="file"] = __FIXTURE_VALID_CSV__',
    expected: 'expectVisible: button:has-text("取込実行")',
    judgeMethod: 'dom',
    note: 'ファイル選択後、取込実行ボタンが有効になること',
  },
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-01',
    patternName: '正常 CSV で取込実行 → 確定件数表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/valid-products.csv が配置済み',
    stepNo: 3,
    operation: 'click: button:has-text("取込実行")',
    expected: 'expectVisible: text=取込が完了しました; expectVisible: text=件',
    judgeMethod: 'both',
    note: '「取込が完了しました」と確定件数が表示されること',
  },
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-02',
    patternName: '同じ CSV を再実行 → 全件 updated で冪等',
    precondRole: 'SYS_ADMIN',
    precondData: 'TC-005-01 が完了後（同データ取込済み）',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: input[type="file"]',
    judgeMethod: 'dom',
    note: '冪等確認: 再取込で全件 updated になること',
  },
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-02',
    patternName: '同じ CSV を再実行 → 全件 updated で冪等',
    precondRole: 'SYS_ADMIN',
    precondData: 'TC-005-01 が完了後（同データ取込済み）',
    stepNo: 2,
    operation: 'fill: input[type="file"] = __FIXTURE_VALID_CSV__',
    expected: 'expectVisible: button:has-text("取込実行")',
    judgeMethod: 'dom',
    note: '',
  },
  {
    scenarioId: 'TC-005',
    scenarioName: '正常 CSV 取込実行（冪等）',
    patternId: 'TC-005-02',
    patternName: '同じ CSV を再実行 → 全件 updated で冪等',
    precondRole: 'SYS_ADMIN',
    precondData: 'TC-005-01 が完了後（同データ取込済み）',
    stepNo: 3,
    operation: 'click: button:has-text("取込実行")',
    expected: 'expectVisible: text=取込が完了しました; expectVisible: text=新規 0 件',
    judgeMethod: 'both',
    note: '再実行は全件 updated（新規 0 件）になること（all upsert by code）',
  },

  // ===== TC-006: 不正 CSV + 取込実行 → エラーテーブル =====
  {
    scenarioId: 'TC-006',
    scenarioName: '不正 CSV 取込エラー',
    patternId: 'TC-006-01',
    patternName: '不正 CSV（価格非数値 / 不存在カテゴリー）で取込実行 → エラーテーブル表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/invalid-products.csv が配置済み',
    stepNo: 1,
    operation: 'goto: /dashboard/imports',
    expected: 'expectVisible: input[type="file"]',
    judgeMethod: 'dom',
    note: 'ページが開いていること',
  },
  {
    scenarioId: 'TC-006',
    scenarioName: '不正 CSV 取込エラー',
    patternId: 'TC-006-01',
    patternName: '不正 CSV（価格非数値 / 不存在カテゴリー）で取込実行 → エラーテーブル表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/invalid-products.csv が配置済み',
    stepNo: 2,
    operation: 'fill: input[type="file"] = __FIXTURE_INVALID_CSV__',
    expected: 'expectVisible: button:has-text("取込実行")',
    judgeMethod: 'dom',
    note: '',
  },
  {
    scenarioId: 'TC-006',
    scenarioName: '不正 CSV 取込エラー',
    patternId: 'TC-006-01',
    patternName: '不正 CSV（価格非数値 / 不存在カテゴリー）で取込実行 → エラーテーブル表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/invalid-products.csv が配置済み',
    stepNo: 3,
    operation: 'click: button:has-text("取込実行")',
    expected: 'expectVisible: text=0 件取込; expectVisible: text=行番号',
    judgeMethod: 'both',
    note: '「0 件取込」が明示され、エラーテーブル（行番号・列・理由）が表示されること',
  },
  {
    scenarioId: 'TC-006',
    scenarioName: '不正 CSV 取込エラー',
    patternId: 'TC-006-01',
    patternName: '不正 CSV（価格非数値 / 不存在カテゴリー）で取込実行 → エラーテーブル表示',
    precondRole: 'SYS_ADMIN',
    precondData: 'tmp/e2e-fixtures/invalid-products.csv が配置済み',
    stepNo: 4,
    operation: 'waitFor: button:has-text("エラー CSV ダウンロード")',
    expected: 'expectVisible: button:has-text("エラー CSV ダウンロード")',
    judgeMethod: 'both',
    note: 'エラー CSV ダウンロードボタンが表示されること',
  },
];

// ---- xlsx 生成 ---- //
async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('scenarios');

  const columns = [
    'scenarioId',
    'scenarioName',
    'patternId',
    'patternName',
    'precondRole',
    'precondData',
    'stepNo',
    'operation',
    'expected',
    'judgeMethod',
    'result',
    'evidence',
    'note',
  ];

  ws.addRow(columns);

  for (const row of rows) {
    ws.addRow(columns.map((col) => row[col] ?? ''));
  }

  // ヘッダー行スタイル
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => {
    col.width = 30;
  });

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`Generated: ${OUT_PATH}`);
  console.log(`${rows.length} steps across ${new Set(rows.map((r) => r.patternId)).size} patterns`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
