import { type Page } from '@playwright/test';

/**
 * 画面の E2E が叩く backend を、network 層で差し替える（d808・d864）。
 *
 * CI には DB を置かない。画面は `/auth/me`（ログインの解決）→ `/permissions/my-permissions`
 * （権限の解決）を必ず通ってから本文を描くため、この 2 本と、見たい画面が読む API だけを
 * 差し替え、それ以外は 200 で空を返す。差し替えの前提と、各 spec が握る API の接続先は
 * scripts/e2e-preflight.mjs が実行の直前に確かめる。
 *
 * 使う側は先に `addCookies` の「ログイン済みのクッキー」を置く（middleware が /home・
 * /dashboard 配下をクッキーの有無で門にする）。
 */

/**
 * 差し替える API の接続先。scripts/e2e-preflight.mjs が読む形（アプリの既定値と一致すること）。
 * 値を変える時は preflight の判定と一緒に見る。
 */
export const API_ORIGIN = 'http://localhost:3001/api/v1';

/** middleware が門にするクッキー名（src/middleware.ts の AUTH_COOKIE_NAME）。 */
export const AUTH_COOKIE_NAME = 'sp_access_token';

/** ログイン済みの形にする。値は何でも良い（値の検証は backend の仕事で、ここは画面の経路を見る）。 */
export async function signInAs(page: Page) {
  await page
    .context()
    .addCookies([{ name: AUTH_COOKIE_NAME, value: 'e2e-token', domain: 'localhost', path: '/' }]);
}

/** API の URL が path の末尾と一致するか（クエリ文字列は無視する）。 */
export function matchesPath(url: string, path: string): boolean {
  try {
    return new URL(url).pathname.endsWith(path);
  } catch {
    return url.includes(path);
  }
}

/** 応答を差し替える 1 本。`status` を省くと 200。 */
export interface ApiResponse {
  path: string;
  method?: string;
  status?: number;
  body: unknown;
}

/**
 * 指定した API だけを与えられた応答に差し替え、他は 200 で空を返す。
 * `stubBackend(page)` の後に呼ぶ（後から登録したものが先に効く）。
 */
export async function stubApi(page: Page, responses: ApiResponse[]) {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    for (const response of responses) {
      if (response.method !== undefined && response.method !== method) continue;
      if (!matchesPath(url, response.path)) continue;
      return route.fulfill({
        status: response.status ?? 200,
        json: response.body,
      });
    }
    return route.fulfill({ status: 200, json: { success: true, data: [] } });
  });
}

/**
 * 画面を描くのに必ず通る 2 本（ログインの解決・権限の解決）を差し替える。
 * 権限は渡した featureId だけを、指定した可否で返す（渡さない機能は「見えない」）。
 */
export function identityResponses(options: {
  permissions: {
    featureId: string;
    canView?: boolean;
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
  }[];
}): ApiResponse[] {
  return [
    {
      path: '/auth/me',
      method: 'GET',
      body: {
        success: true,
        data: {
          id: 'e2e-user-1',
          username: 'e2e-admin',
          name: 'E2E管理者',
          role: 'SYS_ADMIN',
          mustChangePassword: false,
        },
      },
    },
    {
      path: '/permissions/my-permissions',
      method: 'GET',
      body: {
        success: true,
        data: {
          permissions: options.permissions.map((p) => ({
            featureId: p.featureId,
            canView: p.canView ?? true,
            canCreate: p.canCreate ?? true,
            canUpdate: p.canUpdate ?? true,
            canDelete: p.canDelete ?? true,
          })),
        },
      },
    },
  ];
}
