// UI シナリオ runner — Excel を読んで Playwright で実行し、結果を Excel に書き戻す。
//
// 使い方:
//   node packages/frontend/tests/e2e/run-scenario.mjs <xlsx-path>
//
// Excel スキーマと運用工程は docs/discover/specs/2026-05-12-ui-scenario-testing-design.md を参照。
//
// Cell DSL（開発エージェントが対話で詰めた自然言語を Excel 化する時に使う prefix）:
//   operation 列:
//     goto: <url-path>                   e.g. goto: /dashboard/announcements
//     click: <selector>                  e.g. click: text=新規登録 / click: button:has-text("検索")
//     fill: <selector> = <value>         e.g. fill: input[name="title"] = "テスト" / fill: ... = bare
//     waitFor: <selector>                e.g. waitFor: text=お知らせ
//     複数アクションは ; で連結可
//
//   expected 列:
//     expectText: <selector> = <text>    部分一致
//     expectVisible: <selector>
//     expectHidden: <selector>           **DOM に存在する前提**で visible=false を要求 (typo を検知)
//     expectAbsent: <selector>           DOM に**存在しない**ことを要求 (条件レンダリングで非描画の確認)
//     expectCount: <selector> = <n>      要素数の完全一致
//     expectUrl: <substring>             page.url() に含まれるか
//     複数 assertion は ; で連結可
//
// judgeMethod=vision は Phase 3 で対応予定（現状 dom のみ）。

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, withRole } from './lib/auth-helpers.mjs';
import { fillFormField, parseFillOperand } from './lib/form-helpers.mjs';
import { readScenarios, writeResults, isXlsxLocked } from './lib/xlsx-io.mjs';

const FRONTEND = process.env.UI_TEST_FRONTEND ?? 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = resolve(__dirname, '../../../../tmp/ui-test');
mkdirSync(EVIDENCE_DIR, { recursive: true });

async function main() {
  const xlsxArg = process.argv[2];
  if (!xlsxArg) {
    console.error('usage: node run-scenario.mjs <xlsx-path>');
    process.exit(1);
  }
  const xlsxPath = resolve(process.cwd(), xlsxArg);
  if (!existsSync(xlsxPath)) {
    console.error(`xlsx not found: ${xlsxPath}`);
    process.exit(1);
  }
  if (isXlsxLocked(xlsxPath)) {
    console.error(`xlsx is open in Excel (lock file detected): ${xlsxPath}`);
    console.error('閉じてから再実行してください。');
    process.exit(1);
  }

  const patterns = await readScenarios(xlsxPath);
  console.log(`loaded ${patterns.length} pattern(s) from ${xlsxPath}`);

  // throttle 回避: role でグルーピングして 1 login 1 context で複数 pattern を捌く
  const byRole = new Map();
  for (const p of patterns) {
    const role = p.precondRole || 'WH_USER';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(p);
  }

  const browser = await launchBrowser();
  const allResults = [];
  let okCount = 0;
  let ngCount = 0;
  try {
    for (const [role, group] of byRole.entries()) {
      const username = roleToUsername(role);
      console.log(`\n### role=${role} (${group.length} pattern) login as ${username} ###`);
      const results = await runRoleGroup(browser, username, group);
      for (const r of results) {
        allResults.push(r);
        if (r.result === 'OK') okCount++;
        else if (r.result === 'NG') ngCount++;
      }
    }
  } finally {
    await browser.close();
  }

  await writeResults(xlsxPath, allResults);
  console.log(`\n--- summary ---`);
  console.log(`total steps: ${allResults.length}`);
  console.log(`OK: ${okCount}`);
  console.log(`NG: ${ngCount}`);
  if (ngCount > 0) {
    console.log(`\nNG details:`);
    for (const r of allResults.filter((x) => x.result === 'NG')) {
      console.log(`  - row ${r._rowIdx}: ${r.evidence}`);
    }
    process.exit(2);
  }
}

function roleToUsername(role) {
  const r = String(role).toUpperCase();
  if (r === 'SYS_ADMIN') return 'ui-test-sysadmin';
  if (r === 'WH_USER') return 'ui-test-whuser';
  // 既に username 形式（ui-test-* 等）ならそのまま使う
  return role;
}

async function runRoleGroup(browser, username, patterns) {
  const allResults = [];
  try {
    await withRole(browser, username, 'UiTest1234!', async (ctx) => {
      for (const pattern of patterns) {
        console.log(
          `  --- ${pattern.scenarioId} / ${pattern.patternId} : ${pattern.patternName} ---`,
        );
        const page = await ctx.newPage();
        try {
          const results = await runPatternSteps(page, pattern);
          allResults.push(...results);
        } finally {
          await page.close();
        }
      }
    });
  } catch (e) {
    console.error(`  role setup failed: ${e.message}`);
    for (const pattern of patterns) {
      for (const step of pattern.steps) {
        if (allResults.find((r) => r._rowIdx === step._rowIdx)) continue;
        allResults.push({
          _rowIdx: step._rowIdx,
          result: 'NG',
          evidence: `setup failed: ${e.message}`,
        });
      }
    }
  }
  return allResults;
}

async function runPatternSteps(page, pattern) {
  const results = [];
  for (const step of pattern.steps) {
    const r = await runStep(page, pattern, step);
    results.push(r);
    if (r.result === 'NG') {
      console.log(`    step ${step.stepNo}: NG  ${r.evidence}`);
      break;
    }
    const tag = r.result === 'pending' ? 'pending(vision)' : 'OK';
    console.log(`    step ${step.stepNo}: ${tag}  ${truncate(step.operation, 60)}`);
  }
  for (const step of pattern.steps) {
    if (results.find((r) => r._rowIdx === step._rowIdx)) continue;
    results.push({ _rowIdx: step._rowIdx, result: 'skip', evidence: '' });
  }
  return results;
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}

async function runStep(page, pattern, step) {
  const judge = (step.judgeMethod || 'dom').toLowerCase();

  // Phase 1: operation 実行 + DOM 判定 (dom / both の時のみ)
  // ここで失敗したら NG 確定。DOM が通った後の screenshot 副作用で結果を上書きしない。
  let domPassed = false;
  try {
    await executeOperation(page, step.operation);
    if (judge === 'dom' || judge === 'both') {
      await assertExpected(page, step.expected);
      domPassed = true;
    }
  } catch (e) {
    let evidence = e.message;
    try {
      const png = await takeEvidence(page, pattern, step, 'fail');
      evidence = `${e.message} | ${png}`;
    } catch {
      /* ignore screenshot failure on the NG path */
    }
    return { _rowIdx: step._rowIdx, result: 'NG', evidence };
  }

  // Phase 2: vision / both で証拠 screenshot を撮る (失敗しても judge 結果を保護)
  if (judge === 'vision' || judge === 'both') {
    try {
      const png = await takeEvidence(page, pattern, step);
      return {
        _rowIdx: step._rowIdx,
        result: judge === 'vision' ? 'pending' : 'OK',
        evidence: png,
      };
    } catch (e) {
      if (judge === 'both' && domPassed) {
        // DOM が pass している以上、judge 結果は OK を維持する。
        // screenshot 失敗は evidence 列に warning として残し、stdout でも知らせる。
        console.warn(`    step ${step.stepNo}: screenshot failed but DOM passed: ${e.message}`);
        return {
          _rowIdx: step._rowIdx,
          result: 'OK',
          evidence: `(screenshot failed: ${e.message})`,
        };
      }
      // judge=vision の場合は screenshot が唯一の出力なので NG 扱い
      return {
        _rowIdx: step._rowIdx,
        result: 'NG',
        evidence: `screenshot failed: ${e.message}`,
      };
    }
  }

  return { _rowIdx: step._rowIdx, result: 'OK', evidence: '' };
}

async function takeEvidence(page, pattern, step, suffix = '') {
  // Excel-sourced fields をファイル名に使うので path traversal を防ぐサニタイズを必須化する
  const slug = (s) =>
    String(s ?? '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60);
  const tag = suffix ? `-${slug(suffix)}` : '';
  const name = `${slug(pattern.scenarioId)}-${slug(pattern.patternId)}-step${slug(step.stepNo)}${tag}.png`;
  const path = `${EVIDENCE_DIR}/${name}`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function executeOperation(page, raw) {
  const cmds = parseCells(raw);
  for (const cmd of cmds) {
    const { verb, operand } = cmd;
    switch (verb) {
      case 'goto': {
        const url = operand.startsWith('http') ? operand : `${FRONTEND}${operand}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        break;
      }
      case 'click': {
        await page.locator(operand).click({ timeout: 10000 });
        break;
      }
      case 'fill': {
        const { selector, value } = parseFillOperand(operand);
        await fillFormField(page, selector, value);
        break;
      }
      case 'waitfor': {
        await page.locator(operand).waitFor({ state: 'visible', timeout: 10000 });
        break;
      }
      default:
        throw new Error(`unknown operation verb: ${verb}`);
    }
  }
}

async function assertExpected(page, raw) {
  if (!raw || !String(raw).trim()) return;
  const cmds = parseCells(raw);
  for (const cmd of cmds) {
    const { verb, operand } = cmd;
    switch (verb) {
      case 'expecttext': {
        const { selector, value } = parseFillOperand(operand);
        const text = await page.locator(selector).first().innerText({ timeout: 5000 });
        if (!text.includes(value)) {
          throw new Error(`expectText: "${value}" not found in "${text.slice(0, 80)}"`);
        }
        break;
      }
      case 'expectvisible': {
        const count = await page.locator(operand).count();
        if (count === 0) throw new Error(`expectVisible: ${operand} not found`);
        const visible = await page.locator(operand).first().isVisible();
        if (!visible) throw new Error(`expectVisible: ${operand} exists but not visible`);
        break;
      }
      case 'expecthidden': {
        // 「DOM に存在するが visible でない」を厳格に要求。
        // selector typo で count=0 になった時に偽陽性で pass しないよう、不在は明示的に NG にする。
        // 「DOM に存在しないことを期待」したい場合は expectAbsent を使う。
        const count = await page.locator(operand).count();
        if (count === 0) {
          throw new Error(
            `expectHidden: ${operand} not found in DOM (use expectAbsent if non-existence is intended)`,
          );
        }
        const visible = await page.locator(operand).first().isVisible();
        if (visible) throw new Error(`expectHidden: ${operand} is visible`);
        break;
      }
      case 'expectabsent': {
        // DOM に存在しないことを要求。条件レンダリングで element が描画されないケース用。
        const count = await page.locator(operand).count();
        if (count > 0) {
          throw new Error(`expectAbsent: ${operand} found in DOM (count=${count})`);
        }
        break;
      }
      case 'expectcount': {
        const { selector, value } = parseFillOperand(operand);
        const expectedCount = Number(value);
        const actual = await page.locator(selector).count();
        if (actual !== expectedCount) {
          throw new Error(`expectCount: ${selector} expected ${expectedCount}, got ${actual}`);
        }
        break;
      }
      case 'expecturl': {
        try {
          await page.waitForURL((u) => u.toString().includes(operand), { timeout: 5000 });
        } catch {
          throw new Error(`expectUrl: "${operand}" not in "${page.url()}" (after 5s wait)`);
        }
        break;
      }
      default:
        throw new Error(`unknown assertion verb: ${verb}`);
    }
  }
}

// "verb: operand; verb: operand" を [{verb, operand}, ...] にパース
function parseCells(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error(`empty or non-string cell: ${raw}`);
  }
  const parts = splitTopLevelSemicolon(raw);
  return parts.map((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) {
      throw new Error(`missing verb in "${part}" (expected "verb: operand")`);
    }
    const verb = part.slice(0, colonIdx).trim().toLowerCase();
    const operand = part.slice(colonIdx + 1).trim();
    return { verb, operand };
  });
}

// セミコロン分割。ただし quoted value 内のセミコロンは保持する。
function splitTopLevelSemicolon(s) {
  const out = [];
  let buf = '';
  let inQuote = false;
  for (const ch of s) {
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
    } else if (ch === ';' && !inQuote) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

main().catch((e) => {
  console.error('runner error:', e);
  process.exit(1);
});
