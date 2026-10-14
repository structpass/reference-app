// Lv1 UI 検証 — auth 必須 / 多シナリオ / form 非検証 の三条件で使う。
// 発火条件・使い方・他検証手段との切り分けは ./README.md 参照。
//
// auth 経路: ./lib/auth-helpers.mjs (API + cookie 注入) を共有。
// scenario 部分は announcements 検証用のサンプル。他ページに流用する時はこのファイルを
// コピーして scenarios だけ書き換える運用を想定。

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { launchBrowser, withRole } from './lib/auth-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../../tmp/ui-test');
mkdirSync(OUT_DIR, { recursive: true });

const FRONTEND = process.env.UI_TEST_FRONTEND ?? 'http://localhost:3000';

async function snap(context, url, outName) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const path = `${OUT_DIR}/${outName}`;
  await page.screenshot({ path, fullPage: true });
  await page.close();
  console.log(`OK ${outName}  ${url}`);
}

const browser = await launchBrowser();
try {
  // --- scenarios: 流用時はここを書き換える ---
  await withRole(browser, 'ui-test-whuser', 'UiTest1234!', async (ctx) => {
    await snap(ctx, `${FRONTEND}/dashboard`, 'scenario-1-whuser-dashboard.png');
  });
  // --- /scenarios ---

  console.log('All scenarios captured.');
} catch (e) {
  console.error('Capture failed:', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
