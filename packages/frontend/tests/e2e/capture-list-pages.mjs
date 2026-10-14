// Lv1 — 7 マスタ一覧の差分撮影（products 確定形に揃った状態の検証用）
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { launchBrowser, withRole } from './lib/auth-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND = process.env.UI_TEST_ROUND ?? '1';
const OUT_DIR = resolve(__dirname, `../../../../tmp/ui-test/round-${ROUND}`);
mkdirSync(OUT_DIR, { recursive: true });

const FRONTEND = process.env.UI_TEST_FRONTEND ?? 'http://localhost:3000';

const PAGES = [
  ['products', '商品'],
  ['carriers', '運送会社'],
  ['warehouses', '倉庫'],
  ['suppliers', '仕入先'],
  ['categories', 'カテゴリー'],
  ['users', 'ユーザー'],
  ['groups', 'グループ'],
  ['orders', '発注'],
  ['receivings', '入荷'],
  ['shipments', '出荷'],
  ['shipping', '入出荷'],
  ['stocks', '在庫'],
  ['stocktakings', '棚卸'],
  ['forecast', '予測在庫'],
];

async function snap(context, url, outName) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const path = `${OUT_DIR}/${outName}`;
  await page.screenshot({ path, fullPage: false });
  await page.close();
  console.log(`OK ${outName}  ${url}`);
}

const browser = await launchBrowser();
try {
  await withRole(browser, 'ui-test-sysadmin', 'UiTest1234!', async (ctx) => {
    for (const [slug] of PAGES) {
      await snap(ctx, `${FRONTEND}/dashboard/${slug}`, `list-${slug}.png`);
    }
  });
  console.log(`All captured to ${OUT_DIR}`);
} catch (e) {
  console.error('Capture failed:', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
