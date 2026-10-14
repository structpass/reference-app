import axios from 'axios';
import { resolveHttpUrl } from '@/lib/url-guard';

// v2-420: ビルド時 env の汚染で javascript: 等の危険スキームが遷移先へ焼き込まれるのを防ぐ。
// この値は次の2経路でクライアントへ渡るため、入口で http(s) を検証する（url-guard.ts）。
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const API_BASE_URL = resolveHttpUrl(process.env.NEXT_PUBLIC_API_URL, DEFAULT_API_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/**
 * 401 応答時のリダイレクト先 URL を組み立てる。
 *
 * 設計:
 * - silent SSO が生きている時 (rete IdP セッション健在) は backend の
 *   `/auth/oidc/silent-login?return=<path>` へ top-level 遷移させる。成功すれば JWT cookie が
 *   更新され、ユーザーは元々いたページに戻る。失敗 (IdP セッション切れ) は backend 側で
 *   /login?error=sso へ落ちる（silent-login endpoint は /login を戻り先に許さない安全弁付き）。
 * - 既に /login 系統にいる時は無限ループになるので何もしない。
 * - 認証資格情報検証系 endpoint の 401（後方互換のため遺る `/auth/login` の credentials 誤り等）は
 *   silent-login に流さず呼び元に返す。**`/auth/me`（JWT セッション検査）は silent-login させる**
 *   （これが silent SSO の主たる発火点。`/auth/` 部分一致で握り潰すと JWT 切れ時に無認証状態で
 *   ユーザー放置になるので code-reviewer HIGH #1 で是正）。
 *
 * 戻り値の例: `http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fannouncements%2F123%23section`
 *
 * currentPath には window.location.pathname + search + hash を含める想定。hash を含めて
 * silent SSO 成功後に元ページ内のアンカーへ戻れる（c2: fragment 保持・silent SSO の UX 改善）。
 * encodeURIComponent はクエリ値としての安全な転送のためのエンコードであり、Express はクエリを
 * デコードするため backend の returnUrl 変数は decode 済みのリテラル `#` を受け取る（`%23` の
 * まま path 扱いされるわけではない）。callback 後の Location ヘッダに `${frontend}${returnUrl}`
 * の形でリテラル `#` を含めて返すため、ブラウザがアンカー位置にスクロールする。安全性は
 * 「302 Location ヘッダの fragment は HTML に反映されない」点に依拠する（rete-auth-0009 L-3）。
 */
export function buildSilentLoginRedirect(currentPath: string): string {
  // v2-420: 遷移先を組み立てるもう1つの経路。env の値はモジュール定数（API_BASE_URL）で
  // 検証済みだが、この関数は window.location.href へ渡る URL を作るため同じ入口を通す。
  const base = resolveHttpUrl(process.env.NEXT_PUBLIC_API_URL, DEFAULT_API_URL);
  const trimmedBase = base.replace(/\/+$/, '');
  const path = currentPath && currentPath.startsWith('/') ? currentPath : '/';
  return `${trimmedBase}/auth/oidc/silent-login?return=${encodeURIComponent(path)}`;
}

/**
 * silent-login を抑止する URL パターン（資格情報検証系）。
 *
 * なぜ `/auth/` 部分一致でなく allow-list か: silent SSO の主たる発火点は `/auth/me` の 401
 * （JWT 切れ検知）。`/auth/` 部分一致だと `/auth/me` も握り潰して UX を破壊する一方、
 * explicit allow-list はSSO 移行で撤去済みだが歴史的経緯で残る login 系 credential endpoint と
 * 新規追加される auth 内部 endpoint を限定的に除外できる。
 *
 * 許容例（silent-login に流す）: `/auth/me`, `/auth/logout`（logout は後段で 401 を返さないが
 * 万一の時）, `/announcements`, 任意業務 endpoint
 * 除外例（silent-login 抑止）: `/auth/login`, `/auth/register`, `/auth/oauth-token`,
 * `/auth/password-reset` 等の資格情報検証 endpoint
 *
 * パターンは prefix ではなく exact match（trailing / を許容）で判定する。/auth/wild のような
 * 将来 endpoint を意図せず拾わないように保守的になっている。
 */
export function shouldSkipSilentLogin(errorConfigUrl: string | undefined): boolean {
  if (typeof errorConfigUrl !== 'string') return false;
  // request URL は baseURL を含まない相対パス想定（Axios の `url`）。先頭 `/` を許容。
  const url = errorConfigUrl.replace(/^\/+/, '');
  // silent-login endpoint 自体は silent-login を再起動しない（無限ループ回避・sanitize 済みなので
  // 仮に踏んでも returnUrl が空で /login 判定に流れるが、二重起動を避ける）
  if (url === 'auth/oidc/silent-login' || url.startsWith('auth/oidc/silent-login?')) return true;
  // 明示 allow-list（資格情報検証 endpoint）
  const credentialsEndpoints = new Set([
    'auth/login',
    'auth/register',
    'auth/oauth-token',
    'auth/password-reset',
    'auth/forgot-password',
  ]);
  return credentialsEndpoints.has(url);
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window === 'undefined') {
        return Promise.reject(error);
      }
      // pathname を lowercase 化して大文字小文字を区別しない判定にする。
      // pathname === '/Login' 等のような表記が現れた場合にも無限ループ抑止の安全弁を機能させる
      // （FE 側で pathname を正規化せず渡してくる router/環境への多層防御）。
      const pathname = window.location.pathname.toLowerCase();
      // /login 系では silent-login を再発火しない（無限ループ抑止の二段目の安全弁。
      // 一段目は backend の sanitizeReturnUrl で /login を戻り先に許さないこと）。
      if (pathname === '/login' || pathname.startsWith('/login/')) {
        return Promise.reject(error);
      }
      // 資格情報検証 endpoint は silent-login に流さず呼び元に返す（form エラー表示のため）。
      // 重要なのは `/auth/me` は silent-login に流れること（JWT 切れ検知 → 再認証）。
      if (shouldSkipSilentLogin(error.config?.url)) {
        return Promise.reject(error);
      }
      // path + search + hash を全て含める。hash は fragment（アンカー）で、silent SSO 成功後に
      // 元ページのアンカー位置へ復帰するために必要（c2: UX 改善）。backend は decode 済みリテラル
      // `#` を受け取り、安全性は Location fragment が HTML 非反映な点に依拠する（rete-auth-0009 L-3）。
      window.location.href = buildSilentLoginRedirect(
        window.location.pathname + window.location.search + window.location.hash,
      );
    }
    return Promise.reject(error);
  },
);

export default apiClient;
