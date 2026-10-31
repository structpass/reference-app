import { test, expect, type Page } from '@playwright/test';
import {
  API_ORIGIN,
  identityResponses,
  matchesPath,
  signInAs,
  stubApi,
} from './helpers/backend-stub';

/**
 * 商品フォーム カテゴリードロップダウン（d864 で SSO 前提へ書き換え）。
 *
 * 以前は helpers/auth.ts の login() でユーザー名・パスワードを入れてから叩いていたが、
 * その入力は SSO 化で撤去された。ここではログイン済みのクッキーを置き、backend を
 * network 層で差し替えて、画面の経路と選択肢の描画を見る（CI にも同じ形で乗る）。
 */

const CATEGORIES = [
  { id: 1, code: 'ELEC', name: '電子部品', status: 'ACTIVE' },
  { id: 2, code: 'TOOL', name: '工具', status: 'ACTIVE' },
];

const PRODUCTS = [{ id: 1, code: 'P-001', name: '抵抗 10k', categoryId: 1, price: 120 }];

async function stubBackend(page: Page) {
  await signInAs(page);
  // stubApi を先に置く。Playwright は後から登録した route が先に効くので、一覧を差し替える
  // route はその後に置く（逆にすると stubApi の空応答が一覧を飲み込む）。
  await stubApi(page, identityResponses({ permissions: [{ featureId: 'products' }] }));
  // 接続先（API_ORIGIN）を前に付けて絞る。パスだけの正規表現にすると、画面そのものの URL
  // まで当たり、HTML の代わりに JSON を返して描画が止まる。
  await page.route(`${API_ORIGIN}/categories**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || !matchesPath(request.url(), '/categories')) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      json: {
        success: true,
        data: CATEGORIES,
        meta: { page: 1, limit: 100, total: CATEGORIES.length, totalPages: 1 },
      },
    });
  });
  await page.route(`${API_ORIGIN}/products**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.fallback();
    if (matchesPath(request.url(), '/products/1')) {
      return route.fulfill({
        status: 200,
        json: { success: true, data: { ...PRODUCTS[0], category: CATEGORIES[0] } },
      });
    }
    if (!matchesPath(request.url(), '/products')) return route.fallback();
    return route.fulfill({
      status: 200,
      json: {
        success: true,
        data: PRODUCTS,
        meta: { page: 1, limit: 20, total: PRODUCTS.length, totalPages: 1 },
      },
    });
  });
}

test.describe('商品フォーム カテゴリードロップダウン', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
  });

  test('商品登録画面にカテゴリーの選択欄が表示される', async ({ page }) => {
    await page.goto('/dashboard/products/new');

    // 見出しは「商品登録」を使う（表示名と、lsv2 で置き換えた語彙のどちらでも拾う）。
    await expect(page.getByRole('heading', { name: /商品登録|商品を登録/ })).toBeVisible();

    // カテゴリーの選択欄（未選択なら「選択してください」）。
    await expect(page.getByRole('button', { name: '選択してください' })).toBeVisible();
  });

  test('カテゴリードロップダウンにマスターデータが表示される', async ({ page }) => {
    await page.goto('/dashboard/products/new');

    await page.getByRole('button', { name: '選択してください' }).click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 10000 });
    await expect(listbox.getByRole('option', { name: '電子部品' })).toBeVisible();
    await expect(listbox.getByRole('option', { name: '工具' })).toBeVisible();
  });

  test('選択したカテゴリーが欄に残る', async ({ page }) => {
    await page.goto('/dashboard/products/new');

    await page.getByRole('button', { name: '選択してください' }).click();
    await page.getByRole('option', { name: '電子部品' }).click();

    await expect(page.getByRole('button', { name: '電子部品' })).toBeVisible();
  });

  test('商品一覧でカテゴリーの絞り込みが開ける', async ({ page }) => {
    await page.goto('/dashboard/products');

    await expect(page.getByRole('heading', { name: '商品一覧' })).toBeVisible();

    // カテゴリーの絞り込み（選択肢が無い時は見出しの語がそのまま出る）。
    const categoryFilter = page.getByRole('button', { name: /カテゴリーで絞り込み|全カテゴリー/ });
    await expect(categoryFilter).toBeVisible();
    await categoryFilter.click();

    // 選択肢の一覧にマスターの名前が出る（backend は上の差し替え）。
    await expect(page.getByRole('menuitem', { name: '電子部品' })).toBeVisible({ timeout: 10000 });
  });

  test('商品編集画面でカテゴリーが選択済みで表示される', async ({ page }) => {
    await page.goto('/dashboard/products');

    await page.locator('table tbody tr').first().click();

    await expect(page.getByRole('heading', { name: /商品編集|商品を編集/ })).toBeVisible();

    // カテゴリーの欄は、プレースホルダーではなく実際のカテゴリー名が入っている。
    await expect(page.getByRole('button', { name: '電子部品' })).toBeVisible();
    await expect(page.getByRole('button', { name: '選択してください' })).toHaveCount(0);
  });
});
