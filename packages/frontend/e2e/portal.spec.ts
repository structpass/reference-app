import { test, expect } from '@playwright/test';
import { identityResponses, signInAs, stubApi } from './helpers/backend-stub';

/**
 * 配布の入口（d808）。
 *
 * これまで画面の E2E は categories / product-category-dropdown / change-password の 3 本で、
 * どれも「手元の SSO 済み環境」を前提にしていた（helpers/auth.ts は撤去済みのユーザー名・
 * パスワード入力を探し、change-password は撤去済みの画面を前提にしている）。配布の入口＝
 * ログイン後の着地（/home）と件数表示は、CI で誰も見ていなかった。
 *
 * この spec は次の 2 つだけを見る:
 *   - 入口の経路（ルート `/dashboard` は恒久リダイレクトで /home に着地する）
 *   - 着地の件数が権限フィルタの結果どおりに出る（Home が出すカテゴリ外の件数は出さない）
 *
 * 相手の backend は network 層で差し替える（CI に DB を持ち込まない）。差し替えるのは
 * 要約（/dashboard/counts）と、画面を描くのに必ず通る 3 本（/auth/me・
 * /permissions/my-permissions）だけ。他の API は叩かれても 200 で空を返す。
 * 差し替えの部品は helpers/backend-stub.ts にまとめてある（d864 で他の spec も同じ形へ寄せた）。
 */

const MY_PERMISSIONS = [
  { featureId: 'products', canView: true, canCreate: true, canUpdate: true, canDelete: true },
  { featureId: 'users', canView: true, canCreate: true, canUpdate: true, canDelete: true },
];

// Home が描くのはマスタ管理(A)・入出荷管理(B)・在庫管理(C)・発注管理(D) の 4 区分だけ。
// permissions(運用管理・F) と object-types(システム管理・E) はこの 4 区分の外なので、
// 「件数が返っても描かれない」ことを確かめる材料になる（users はマスタ管理(A) に属するため使わない）。
const COUNTS = {
  success: true,
  data: {
    counts: [
      { featureId: 'products', count: 1234 },
      { featureId: 'warehouses', count: 5 },
      { featureId: 'permissions', count: 9999 },
      { featureId: 'object-types', count: 8888 },
    ],
  },
};

async function stubBackend(page: import('@playwright/test').Page) {
  // middleware は sp_access_token が無いと /home を /login へ返す。入口の描画を見るため
  // 値は何でも良い（値の検証は backend の仕事で、ここは画面の経路を見る）。
  await signInAs(page);
  await stubApi(page, [
    { path: '/dashboard/counts', method: 'GET', body: COUNTS },
    ...identityResponses({ permissions: MY_PERMISSIONS }),
  ]);
}

test.describe('配布の入口（/dashboard → /home）', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
  });

  test('ルートの /dashboard は /home に着地する', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/home$/);
  });

  test('着地で権限フィルタの結果どおりの件数が表示される', async ({ page }) => {
    await page.goto('/home');

    // 3桁区切りで出る（1,234）。
    await expect(page.getByText('1,234')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('5', { exact: true })).toBeVisible();
    // Home の 4 区分（A〜D）の外にある機能（運用管理の permissions・システム管理の object-types）は描かない。
    await expect(page.getByText('9,999')).toHaveCount(0);
    await expect(page.getByText('8,888')).toHaveCount(0);
  });
});
