import { type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '..', '.auth-state.json');

export async function login(page: Page, username = 'admin', password = 'admin123') {
  // ストレージステートが保存済みならAPIコールでトークン設定
  if (fs.existsSync(AUTH_FILE)) {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    const token = state.token;
    if (token) {
      await page.goto('/login');
      await page.evaluate((t) => {
        localStorage.setItem('struct_pass_token', t);
      }, token);
      await page.goto('/dashboard');
      await page.waitForURL('**/dashboard**', { timeout: 15000 });
      return;
    }
  }

  // 初回ログイン
  await page.goto('/login');
  await page.getByLabel('ユーザー名').fill(username);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });

  // トークンを保存
  const token = await page.evaluate(() => localStorage.getItem('struct_pass_token'));
  if (token) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ token }));
  }
}
