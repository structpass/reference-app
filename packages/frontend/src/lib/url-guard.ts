/**
 * ビルド時環境変数から得た接続先 URL のスキーム検証（多層防御）。
 *
 * なぜ必要か: `NEXT_PUBLIC_*` はビルド時にクライアントの JS へ文字列として焼き込まれる。
 * ビルド環境の env が汚染されると `javascript:` 等の危険スキームがそのまま
 * `window.location.href` や `<a href>` へ渡り、遷移先でスクリプトが動きうる。
 * 本番 CSP（script-src の nonce + strict-dynamic）が実行を拒否するため実悪用は
 * 確認されていないが、遷移先を決める経路では入口で弾く（点検 2026-10-11 / v2-420）。
 *
 * 使い方: 既定値を持つ env は `resolveHttpUrl(process.env.X, DEFAULT_X)` で解決する。
 * 検証を通らない値（`javascript:`・`data:`・相対・空・空白のみ）は既定値へフォールバックし、
 * 危険な値が遷移先として採用されないようにする。
 */

/** http / https のみを許可する。大文字スキーム（HTTP://）も許可する。 */
const HTTP_URL_PATTERN = /^https?:\/\//i;

/**
 * 値が http(s) の絶対 URL かどうかを判定する。
 *
 * 先頭の空白は許さない（` javascript:` のような回避を防ぐ）。`new URL` は使わない
 * （`javascript:alert(1)` もパースに成功してしまい、スキーム判定の代用にならない）。
 */
export function isHttpUrl(value: string | undefined | null): boolean {
  if (typeof value !== 'string') return false;
  return HTTP_URL_PATTERN.test(value);
}

/**
 * env の値を検証し、http(s) でなければ fallback を返す。
 *
 * @param value 検証する値（通常は `process.env.NEXT_PUBLIC_*`）
 * @param fallback http(s) でなかった時に使う既定値（呼び出し側で http(s) を保証する）
 */
export function resolveHttpUrl(value: string | undefined | null, fallback: string): string {
  return isHttpUrl(value) ? (value as string) : fallback;
}
