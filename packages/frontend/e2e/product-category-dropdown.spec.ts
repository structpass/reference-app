import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('商品フォーム カテゴリードロップダウン', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('商品登録画面にカテゴリードロップダウンが表示される', async ({ page }) => {
    await page.goto('/dashboard/products/new');

    await expect(page.getByRole('heading', { name: '商品登録' })).toBeVisible();

    // カテゴリーセレクトのトリガー（「カテゴリーを選択」テキストを含む）
    await expect(page.getByText('カテゴリーを選択')).toBeVisible();
  });

  test('カテゴリードロップダウンにマスターデータが表示される', async ({ page }) => {
    await page.goto('/dashboard/products/new');

    // カテゴリーのセレクトトリガーをクリック
    await page.getByText('カテゴリーを選択').click();

    // ドロップダウンオプションが表示される
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 10000 });
    await expect(listbox.getByRole('option').first()).toBeVisible();
  });

  test('商品一覧でカテゴリーフィルターが機能する', async ({ page }) => {
    await page.goto('/dashboard/products');

    await expect(page.getByRole('heading', { name: '商品一覧' })).toBeVisible();

    // カテゴリーフィルタードロップダウン
    const categoryFilter = page.getByRole('button', { name: '全カテゴリー' });
    await expect(categoryFilter).toBeVisible();

    // ドロップダウンを開く
    await categoryFilter.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 10000 });
  });

  test('商品編集画面でカテゴリーが選択済みで表示される', async ({ page }) => {
    await page.goto('/dashboard/products');
    await page.locator('table tbody tr').first().click();

    await expect(page.getByRole('heading', { name: '商品編集' })).toBeVisible();

    // カテゴリーフィールドに値がセットされている（「カテゴリーを選択」ではない実際のカテゴリー名）
    // SelectTrigger 内のテキストがプレースホルダーでないことを確認
    const categoryLabel = page.locator('text=カテゴリー').first();
    await expect(categoryLabel).toBeVisible();

    // カテゴリーの SelectTrigger にはプレースホルダーではなく実際の値が入っている
    const selectTriggers = page.locator('button:has(svg.lucide-chevron-down)');
    const categoryTrigger = selectTriggers.first();
    await expect(categoryTrigger).toBeVisible();
    await expect(categoryTrigger).not.toHaveText('カテゴリーを選択');
  });
});
