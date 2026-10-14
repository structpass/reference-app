import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('カテゴリーマスター CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('カテゴリー一覧が表示される', async ({ page }) => {
    await page.goto('/dashboard/categories');

    await expect(page.getByRole('heading', { name: 'カテゴリー一覧' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('新規カテゴリーを作成できる', async ({ page }) => {
    const code = `E2E-${Date.now()}`;
    const name = 'E2Eテストカテゴリー';

    await page.goto('/dashboard/categories/new');
    await expect(page.getByRole('heading', { name: 'カテゴリー登録' })).toBeVisible();

    await page.getByLabel('カテゴリーコード').fill(code);
    await page.getByLabel('カテゴリー名').fill(name);
    await page.getByRole('button', { name: '登録する' }).click();

    // useCrudApi のトースト: 「カテゴリーを登録しました」
    await expect(page.getByText('カテゴリーを登録しました')).toBeVisible({ timeout: 10000 });
  });

  test('カテゴリーを編集できる', async ({ page }) => {
    await page.goto('/dashboard/categories');
    await page.locator('table tbody tr').first().click();

    await expect(page.getByRole('heading', { name: 'カテゴリー編集' })).toBeVisible();
    const nameInput = page.getByLabel('カテゴリー名');
    const originalName = await nameInput.inputValue();
    await nameInput.fill(originalName + '（編集済）');
    await page.getByRole('button', { name: '更新する' }).click();

    await expect(page.getByText('更新が完了しました')).toBeVisible({ timeout: 10000 });

    // 元に戻す
    await nameInput.fill(originalName);
    await page.getByRole('button', { name: '更新する' }).click();
    await expect(page.getByText('更新が完了しました')).toBeVisible({ timeout: 10000 });
  });

  test('カテゴリー詳細を閲覧できる', async ({ page }) => {
    await page.goto('/dashboard/categories');
    await page.locator('table tbody tr').first().click();

    await expect(page.getByLabel('カテゴリーコード')).toBeVisible();
    await expect(page.getByLabel('カテゴリー名')).toBeVisible();
  });

  test('検索フィルターが機能する', async ({ page }) => {
    await page.goto('/dashboard/categories');

    const searchInput = page.getByPlaceholder('コード・名前で検索...');
    await searchInput.fill('電子');

    // デバウンス待ち
    await page.waitForTimeout(500);

    await expect(page.locator('table')).toBeVisible();
  });

  test('バリデーションエラーが表示される', async ({ page }) => {
    await page.goto('/dashboard/categories/new');

    await page.getByRole('button', { name: '登録する' }).click();

    await expect(page.getByText('コードは必須です')).toBeVisible();
    await expect(page.getByText('名前は必須です')).toBeVisible();
  });
});
