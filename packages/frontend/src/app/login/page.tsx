'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { resolveHttpUrl } from '@/lib/url-guard';

// identity SoT は rete (OIDC IdP)。reference は OIDC RP なので、
// ログインは backend の OIDC エンドポイントへの「フルページ遷移」で開始する。
// XHR / apiClient ではなくブラウザのトップレベルナビゲーションが必須。
// v2-420: この値は window.location.href と <a href> の両方へ渡るため、入口で http(s) を検証する
// （ビルド時 env の汚染で危険スキームが焼き込まれても遷移しない）。
const API_BASE = resolveHttpUrl(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3001/api/v1');
const OIDC_LOGIN_URL = `${API_BASE}/auth/oidc/login`;

function LoginForm() {
  const searchParams = useSearchParams();
  // OIDC コールバックが失敗すると backend が `/login?error=sso` へ戻す。
  const hasError = searchParams.get('error') === 'sso';

  // ログイン画面は UI カラーテーマを参照せず default 固定。
  // dashboard で plains/island に切り替えてログアウトした際の data-theme 残留対策。
  useEffect(() => {
    document.documentElement.dataset.theme = 'default';
  }, []);

  useEffect(() => {
    if (hasError) {
      // 失敗で戻された直後は自動再開しない（無限リダイレクト防止）。手動再試行に委ねる。
      toast.error('SSO ログインに失敗しました。再度お試しください。');
      return;
    }
    // 未ログインでこの画面に到達 = SSO 未開始。identity SoT は rete のため、
    // ここでパスワードを尋ねず即フルページ遷移で SSO を開始する（Rete に既ログインなら無入力で抜ける）。
    window.location.href = OIDC_LOGIN_URL;
  }, [hasError]);

  // 正常時は即フルページ遷移するため、遷移中メッセージは表示しない（desk-0145）。
  // 失敗時のみカード（失敗表示 + 手動再試行リンク）を描画する。
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--sp-paper)]">
      {hasError && (
        <div className="w-full max-w-md rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)] p-8 shadow-md">
          <div className="mb-8 text-center">
            <h1 className="text-xl font-semibold text-[var(--sp-text-warm)]">
              {process.env.NEXT_PUBLIC_APP_NAME ?? 'Struct Pass'}
            </h1>
            <p className="mt-2 text-sm text-[var(--sp-text-warm-mute)]">
              SSO ログインに失敗しました
            </p>
          </div>

          <a
            href={OIDC_LOGIN_URL}
            className={buttonVariants({ variant: 'sp-primary', className: 'w-full' })}
          >
            SSO でログインし直す
          </a>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
