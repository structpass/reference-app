// API + cookie 注入による auth 経路。React Hook Form + Playwright fill の非互換を回避する。
// `ui-test-*` ユーザーは packages/backend/scripts/create-ui-test-users.ts で作成済前提。

import { chromium, request } from '@playwright/test';

const BACKEND = process.env.UI_TEST_BACKEND ?? 'http://localhost:3001';
const FRONTEND_HOST = process.env.UI_TEST_FRONTEND_HOST ?? 'localhost';

export async function loginAndGetCookies(username, password) {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${BACKEND}/api/v1/auth/login`, {
      data: { username, password },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
      throw new Error(`login failed for ${username}: HTTP ${res.status()}`);
    }
    const state = await ctx.storageState();
    return state.cookies;
  } finally {
    await ctx.dispose();
  }
}

// backend origin (3001) の cookie を frontend origin (3000) に複製して注入する。
// sameSite='Lax' 前提（Strict + HttpOnly + Secure 厳格化時はこの経路は使えない）。
export async function withRole(browser, username, password, runner) {
  const cookies = await loginAndGetCookies(username, password);
  const cookiesForFrontend = cookies.map((c) => ({
    ...c,
    domain: FRONTEND_HOST,
    sameSite: 'Lax',
  }));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(cookiesForFrontend);
  try {
    await runner(ctx);
  } finally {
    await ctx.close();
  }
}

export async function launchBrowser() {
  return chromium.launch();
}
