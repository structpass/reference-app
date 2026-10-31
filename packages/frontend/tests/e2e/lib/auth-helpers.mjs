// OIDC login is performed in the browser before these verification tools run.
// Keep role-specific Playwright storage states under ignored tmp/, never in Git.
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BACKEND = process.env.UI_TEST_BACKEND ?? 'http://localhost:3001';

export async function withRole(browser, role, runner) {
  const stateDir = process.env.UI_TEST_AUTH_DIR;
  if (!stateDir) throw new Error('UI_TEST_AUTH_DIR is required (OIDC storageState directory)');
  if (!/^[A-Z][A-Z0-9_]*$/.test(role)) throw new Error(`Invalid role: ${role}`);
  const context = await browser.newContext({
    storageState: resolve(stateDir, `${role}.json`),
    viewport: { width: 1280, height: 900 },
  });
  try {
    const response = await context.request.get(`${BACKEND}/api/v1/auth/me`);
    if (!response.ok()) throw new Error(`OIDC session unavailable: HTTP ${response.status()}`);
    const profile = await response.json();
    if (profile?.data?.role !== role || profile?.data?.status !== 'ACTIVE') {
      throw new Error(`OIDC session must belong to an active ${role}`);
    }
    await runner(context);
  } finally {
    await context.close();
  }
}

export async function launchBrowser() {
  return chromium.launch();
}
