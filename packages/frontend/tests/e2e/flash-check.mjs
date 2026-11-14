// FeatureGuard v2/v3 の flash 検証用スクリプト (B/C/D/E permanent regression)。
// slow 3G CDP throttle + 多段 screenshot (300/700/1500ms + networkidle) で
// permission 確定前後の描画を捕捉する。
//
// 対象シナリオ:
//   B: WH_USER → /dashboard/products/new          (canCreate=false → null + redirect)
//   C: WH_USER → /dashboard/system-settings       (canView=false → null + redirect → /dashboard)
//   D: SYS_ADMIN → 主要 12 page regression        (通常描画)
//   E: WH_USER → /dashboard/products/{uuid}/view  (canView=true → 正常描画)
//
// 期待:
//   B / C: 全フレームで form / 設定値が見えないこと (FeatureGuard が render 中に null)
//   C final: /dashboard に redirect (404 でないこと — ed9ed77 fix の regression check)
//   D / E: 最終フレームで通常コンテンツが見えること
//
// 出力: tmp/ui-test/{scenario}-{name}-{t}.png (gitignore 対象)
// 認証経路: capture-all.mjs と同じ OIDC storageState。README.md 参照。

import { launchBrowser, withRole } from './lib/auth-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(
  process.env.UI_TEST_OUT_DIR ?? resolve(__dirname, '../../../../tmp/ui-test'),
);
mkdirSync(OUT_DIR, { recursive: true });

const BACKEND = process.env.UI_TEST_BACKEND ?? 'http://localhost:3001';
const FRONTEND = process.env.UI_TEST_FRONTEND ?? 'http://localhost:3000';

// Slow 3G profile: Chrome DevTools Network conditions
const SLOW_3G = {
  offline: false,
  downloadThroughput: (500 * 1024) / 8, // 500 kbps
  uploadThroughput: (500 * 1024) / 8,
  latency: 400, // ms
};

// E シナリオで参照する実在 product UUID を取得する (seed 順序に依存しないため動的取得)
async function fetchProductId(context) {
  const res = await context.request.get(BACKEND + '/api/v1/products?limit=1');
  if (!res.ok()) throw new Error('fetch products failed: HTTP ' + res.status());
  const json = await res.json();
  const id = json?.data?.[0]?.id;
  if (!id) throw new Error('No product found');
  return id;
}

/**
 * slow 3G で対象 URL に遷移し、複数タイミングで screenshot を取る。
 * flash 検出には初期フレーム (300/700/1500ms) と最終 (networkidle or timeout) を比較する。
 */
async function snapFlash(context, url, baseName, { throttle = true } = {}) {
  const page = await context.newPage();

  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_3G);
  }

  // Navigation を待たず screenshot を撮るため waitUntil を 'commit' に
  const navPromise = page.goto(url, { waitUntil: 'commit', timeout: 30000 });

  const timestamps = [300, 700, 1500];
  for (const ms of timestamps) {
    await page.waitForTimeout(ms === 300 ? 300 : 400); // cumulative
    const path = `${OUT_DIR}/${baseName}-t${ms}ms.png`;
    try {
      await page.screenshot({ path, fullPage: false });
      console.log(`  snap ${baseName} @ ${ms}ms`);
    } catch (e) {
      console.log(`  skip ${baseName} @ ${ms}ms (${e.message})`);
    }
  }

  try {
    await navPromise;
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (e) {
    console.log(`  nav settle skipped: ${e.message}`);
  }

  const finalPath = `${OUT_DIR}/${baseName}-final.png`;
  await page.screenshot({ path: finalPath, fullPage: false });
  console.log(`  snap ${baseName} final  ${page.url()}`);

  await page.close();
}

const browser = await launchBrowser();
try {
  // role ごとの OIDC セッションを読み込み、現在の権限を確かめる。
  // --- WH_USER scenarios: B (create flash) + C (view flash) + E (view OK) ---
  console.log('=== WH_USER scenarios (B, C, E) ===');
  await withRole(browser, 'WH_USER', async (whuserCtx) => {
    const productId = await fetchProductId(whuserCtx);
    console.log('-- B: products/new (FeatureGuard create) --');
    await snapFlash(whuserCtx, `${FRONTEND}/dashboard/products/new`, 'B-whuser-products-new');
    console.log('-- C: system-settings (FeatureGuard view → /dashboard) --');
    await snapFlash(whuserCtx, `${FRONTEND}/dashboard/system-settings`, 'C-whuser-system-settings');
    console.log('-- E: products/{uuid}/view (canView=true normal) --');
    await snapFlash(
      whuserCtx,
      `${FRONTEND}/dashboard/products/${productId}/view`,
      'E-whuser-products-view',
      {
        throttle: false,
      },
    );
  });

  // --- SYS_ADMIN scenario D: regression ---
  console.log('=== SYS_ADMIN scenarios (D regression) ===');
  await withRole(browser, 'SYS_ADMIN', async (ctx) => {
    const dPages = [
      '/dashboard',
      '/dashboard/products',
      '/dashboard/products/new',
      '/dashboard/warehouses',
      '/dashboard/users',
      '/dashboard/groups',
      '/dashboard/system-settings',
      '/dashboard/permissions',
      '/dashboard/orders',
      '/dashboard/receivings',
      '/dashboard/shipments',
      '/dashboard/stocks',
    ];
    for (const path of dPages) {
      const name = `D-sysadmin${path.replace(/\//g, '_')}`;
      await snapFlash(ctx, `${FRONTEND}${path}`, name, { throttle: false });
    }
  });

  console.log('\nAll scenarios captured to:', OUT_DIR);
} catch (e) {
  console.error('Capture failed:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
}
