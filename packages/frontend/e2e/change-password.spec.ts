import { test, expect } from '@playwright/test';

/**
 * パスワード変更フロー E2E。
 *
 * SSO 化で、reference 側のパスワード変更画面（/change-password）とログイン入力（ユーザー名・
 * パスワード）は撤去された。identity の正本は rete（OIDC IdP）で、パスワードそのものは
 * ここで扱わない。旧 spec は撤去済みの画面を前提にしていたため、SSO 化の後は手元でも
 * 走らない（CI に載せると必ず赤くなるだけ・d808・d864）。
 *
 * 代わりに、残っている経路（パスワードの変更を促す入口）が reference 側に無いことを、
 * ログインの経路そのもので確かめる。SSO の往復は rete 側（d844 の残り）で見る。
 */

test.describe('パスワード変更フロー（SSO 化後）', () => {
  test('未ログインで /login に来ると、入力欄ではなく SSO の開始へ送られる', async ({ page }) => {
    // SSO の開始は backend へのフルページ遷移なので、相手を差し替えて止める
    // （差し替えないと外に繋ぎに行く）。ここには来ないことが前提で、来たら赤にする。
    await page.route('**/auth/oidc/login', (route) => route.fulfill({ status: 204, body: '' }));

    await page.goto('/login');

    // 撤去済みのログイン入力（ユーザー名・パスワード）は描かれない。
    await expect(page.getByLabel('ユーザー名')).toHaveCount(0);
    await expect(page.getByLabel('パスワード')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ログイン' })).toHaveCount(0);
  });

  test('パスワード変更の画面は reference 側に無い', async ({ page }) => {
    await page.route('**/auth/oidc/login', (route) => route.fulfill({ status: 204, body: '' }));
    await page
      .context()
      .addCookies([
        { name: 'sp_access_token', value: 'e2e-token', domain: 'localhost', path: '/' },
      ]);

    const response = await page.goto('/change-password');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'パスワード変更' })).toHaveCount(0);
  });
});
