'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AuthProvider } from '@/features/auth/components/auth-provider';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { LogOut } from 'lucide-react';

function PendingContent() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  // 承認待ち画面も login と同様 UI テーマを参照せず default 固定。
  useEffect(() => {
    document.documentElement.dataset.theme = 'default';
  }, []);

  // role が付与されたら（管理者が承認したら）着地ページ /home へ。
  useEffect(() => {
    if (!loading && user && user.role !== null) {
      router.replace('/home');
    }
  }, [user, loading, router]);

  // 認証未確定 / 未認証 / 承認済（redirect 待ち）は描画しない。
  if (loading || !user || user.role !== null) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--sp-paper)]">
      <div className="w-full max-w-md rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)] p-8 shadow-md">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-[var(--sp-text-warm)]">アカウント承認待ち</h1>
          <p className="mt-4 text-sm text-[var(--sp-text-warm-mute)]">
            アカウントは作成されましたが、まだ利用権限が割り当てられていません。
          </p>
          <p className="mt-2 text-sm text-[var(--sp-text-warm-mute)]">
            管理者による権限の付与をお待ちください。付与され次第、自動的に画面が切り替わります。
          </p>
        </div>

        <Button variant="sp-outline" onClick={logout} className="w-full">
          <LogOut className="mr-1 h-4 w-4" />
          ログアウト
        </Button>
      </div>
    </div>
  );
}

export default function PendingPage() {
  return (
    <AuthProvider>
      <PendingContent />
    </AuthProvider>
  );
}
