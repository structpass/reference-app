import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'sp_access_token';

/**
 * Auth cookie options.
 *
 * 注意（staging 運用時）:
 * - `NODE_ENV` が `production` 以外（例: `development` のまま staging へ deploy）の場合、
 *   `secure: false` / `sameSite: 'lax'` となり HTTPS 強制が外れる。
 *   staging も HTTPS 終端である場合は `NODE_ENV=production` を必ず設定すること。
 * - 反対に local 開発で HTTPS なし運用が必要なため、`isProduction` 判定を CSP / Caddy 設定とは
 *   独立に保っている。production 判定の唯一のスイッチが NODE_ENV である点を変更する場合は、
 *   `auth/strategies/jwt.strategy.ts` および `main.ts` の cors 設定と必ず併せて見直す。
 */
export function getCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  };
}
