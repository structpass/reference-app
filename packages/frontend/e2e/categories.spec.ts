import { test, expect, type Page } from '@playwright/test';
import {
  API_ORIGIN,
  identityResponses,
  matchesPath,
  signInAs,
  stubApi,
} from './helpers/backend-stub';

/**
 * カテゴリーマスター CRUD（d864 で SSO 前提へ書き換え）。
 *
 * 以前は helpers/auth.ts の login() でユーザー名・パスワードを入れてから叩いていたが、
 * その入力は SSO 化で撤去された。ここではログイン済みのクッキーを置き、backend を
 * network 層で差し替えて、画面の経路・描画・入力の検証を見る（CI にも同じ形で乗る）。
 *
 * 見るのは一覧の描画・検索・入力を空のまま送った時の検証・行から編集への遷移。登録と更新の
 * 送信は、CI に DB が無く差し替え先の API では保存されないため、送信の分岐ではなく
 * 画面の遷移と入力の状態で見る。
 */

const CATEGORIES = [
  { id: 1, code: 'ELEC', name: '電子部品', status: 'ACTIVE' },
  { id: 2, code: 'TOOL', name: '工具', status: 'ACTIVE' },
];

const LIST_BODY = {
  success: true,
  data: CATEGORIES,
  meta: { page: 1, limit: 20, total: CATEGORIES.length, totalPages: 1 },
};

async function stubBackend(page: Page) {
  await signInAs(page);
  // stubApi を先に置く。Playwright は後から登録した route が先に効くので、一覧だけを
  // 差し替える route はその後に置く（逆にすると stubApi の空応答が一覧を飲み込む）。
  await stubApi(page, [
    { path: '/categories/new', method: 'POST', body: { success: true, data: { id: 99 } } },
    // 編集画面は 1 件を GET で読み直す。ここが空を返すと入力欄が空のまま描かれる。
    { path: '/categories/1', method: 'GET', body: { success: true, data: CATEGORIES[0] } },
    { path: '/categories/1', method: 'PUT', body: { success: true, data: CATEGORIES[0] } },
    ...identityResponses({ permissions: [{ featureId: 'categories' }] }),
  ]);
  // 接続先（API_ORIGIN）を前に付けて絞る。パスだけの正規表現にすると、画面そのものの URL
  // （/dashboard/categories）まで当たり、HTML の代わりに JSON を返して描画が止まる。
  await page.route(`${API_ORIGIN}/categories**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || !matchesPath(request.url(), '/categories')) {
      return route.fallback();
    }
    // 検索の引き当ては backend の仕事。ここは「絞り込んでも一覧が描かれる」ところまでを見る。
    const url = new URL(request.url());
    const search = url.searchParams.get('search') ?? '';
    const rows = search
      ? CATEGORIES.filter((c) => c.name.includes(search) || c.code.includes(search))
      : CATEGORIES;
    return route.fulfill({ status: 200, json: { ...LIST_BODY, data: rows } });
  });
}

test.describe('カテゴリーマスター CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
  });

  test('カテゴリー一覧が表示される', async ({ page }) => {
    await page.goto('/dashboard/categories');

    await expect(page.getByRole('heading', { name: 'カテゴリー一覧' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByText('電子部品')).toBeVisible();
  });

  test('検索フィルターが機能する', async ({ page }) => {
    await page.goto('/dashboard/categories');

    const searchInput = page.getByPlaceholder('コード・名前で検索...');
    await searchInput.fill('電子');

    // デバウンス待ち
    await page.waitForTimeout(500);

    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('電子部品')).toBeVisible();
  });

  test('登録画面は入力を空のまま送ると検証エラーが出る', async ({ page }) => {
    await page.goto('/dashboard/categories/new');

    // 見出しは「カテゴリー登録」を使う（表示名と、lsv2 で置き換えた語彙のどちらでも拾う）。
    await expect(
      page.getByRole('heading', { name: /カテゴリー登録|カテゴリーを登録/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'マスタ登録' }).click();

    await expect(page.getByText('コードは必須です')).toBeVisible();
    await expect(page.getByText('名前は必須です')).toBeVisible();
  });

  test('一覧の行から編集へ移れる', async ({ page }) => {
    await page.goto('/dashboard/categories');

    await page.locator('table tbody tr').first().click();

    await expect(page).toHaveURL(/\/dashboard\/categories\/1$/);
    const nameInput = page.getByLabel('カテゴリー名');
    await expect(nameInput).toHaveValue('電子部品');
  });
});
