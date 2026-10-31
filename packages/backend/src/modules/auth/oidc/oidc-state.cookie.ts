import type { CookieOptions } from 'express';

/**
 * OIDC Authorization Code Flow の state / nonce / PKCE code_verifier を
 * callback まで持ち回るための短命・署名付き cookie。
 *
 * - `signed: true`: cookie-parser(secret) により HMAC 署名。改竄を検知する（state 固定化攻撃対策）。
 * - `sameSite: 'lax'`: callback は rete（別オリジン）からの top-level redirect で到達するため、
 *   `strict` だと cookie が送出されず CSRF 検証が常に失敗する。`lax` は top-level GET ナビゲーションで送出される。
 * - `httpOnly`: JS から読めないようにし XSS での state 窃取を防ぐ。
 * - `maxAge`: 認可ラウンドトリップの想定上限（10 分）。期限切れは再ログインを促す。
 */
export const OIDC_STATE_COOKIE_NAME = 'sp_oidc_state';

export function getOidcStateCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    signed: true,
    path: '/',
    maxAge: 10 * 60 * 1000,
  };
}
