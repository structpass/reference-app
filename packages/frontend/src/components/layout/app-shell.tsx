'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/features/auth';
import { SystemConfigProvider } from '@/features/system-settings';
import { ListPreferencesProvider, useListPreferences } from '@/features/list-preferences';
import { PermissionsProvider } from '@/contexts/permissions-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { ThemeApplier } from '@/features/theme';
import { Sidebar } from '@/components/layout/sidebar';
import { EnvBadge } from '@/components/layout/env-badge';
import { GlobalNav } from '@/components/layout/global-nav';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Menu, LogOut, User } from 'lucide-react';

function AppShellContent({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { loaded: preferencesLoaded } = useListPreferences();
  const { loaded: permissionsLoaded } = usePermissions();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // 認証チェックは middleware.ts がサーバーサイドで処理。
    // role 未割当（pending / 承認待ち）は承認待ち画面へ誘導する。
    if (!loading && user && user.role === null) {
      router.replace('/pending');
    }
  }, [user, loading, router]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // 認証未確定時は layout 全体（Sidebar / header 含む）を描画しない。
  // middleware が server side で redirect する間や logout 中に、
  // 前 session の Sidebar が一瞬残るのを防ぐ。
  if (loading || !user) return null;

  return (
    <div className="flex min-h-screen">
      {/* デスクトップ: 固定サイドバー（幅は rete .app-sidebar の 15.5rem=248px と同値・ref-0026。
          サイドバー幅差はグローバルメニューのタブ絶対位置を rete とズラす一因だった） */}
      <div className="hidden md:block md:w-[15.5rem] md:flex-shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>

      {/* モバイル: オーバーレイサイドバー */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* オーバーレイ背景 */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={handleCloseSidebar}
            aria-label="メニューを閉じる"
          />
          {/* サイドバー本体（アニメーション付き） */}
          <div className="relative z-50 h-full w-[15.5rem] shadow-xl transition-transform">
            <Sidebar onCloseMobile={handleCloseSidebar} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* トップバー（左: ハンバーガー(モバイル) + 環境バッジ / 中央: グローバルメニュー / 右: ユーザー名 + ログアウト）
         * ref-0020: 帯高は --header-h（30px・rete cmn-0114 追補と同値）。
         * 構造は rete AppHeader と同型: header は border-b のみ（高さ固定しない）→ 内側 grid が
         * h-[var(--header-h)]。header 自身に h と border-b を同居させると border-box で内容が
         * 29px になり、rete（内容30 + border1 = 31）と「縦幅が微妙に違う」ズレが出る。
         * ref-0026: 行 grid（1fr auto 1fr）でタブ列真中央固定（rete cmn-0119 と同型）。
         * items-stretch + min-h-0: 右の h-7 等が min-height:auto で行を押し広げない（rete 同）。 */}
        <header
          className="sticky top-0 z-30 border-b border-border backdrop-blur"
          style={{ backgroundImage: 'var(--sp-nav-band-bg)', backgroundColor: 'transparent' }}
        >
          <div className="grid h-[var(--header-h)] min-h-0 grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-3 md:px-6">
            <div className="flex min-h-0 items-center gap-2 justify-self-start">
              <Button
                variant="ghost"
                // ref-0020: 帯高 30px 化に伴い sm(h-9=36px) では帯から溢れるため icon-sm(h-7=28px) へ縮小。
                size="icon-sm"
                className="!h-[1.625rem] !min-h-0 md:hidden"
                onClick={handleToggleSidebar}
                aria-label="メニューを開く"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <EnvBadge />
            </div>
            <GlobalNav />
            {user && (
              <div className="flex min-h-0 items-center gap-3 justify-self-end md:gap-6">
                <Link
                  href="/dashboard/my-page"
                  className="inline-flex h-[1.625rem] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-accent-teal)] focus-visible:ring-offset-2"
                  aria-label="マイページ"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>{user.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-[1.625rem] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-accent-teal)] focus-visible:ring-offset-2"
                  aria-label="ログアウト"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>ログアウト</span>
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 bg-background p-3 md:p-6">
          {!loading && user && preferencesLoaded && permissionsLoaded ? children : null}
        </main>
      </div>
    </div>
  );
}

/**
 * 認証済みアプリシェル（Sidebar + トップバー + main）。
 * Provider ツリー（Auth / Permissions / SystemConfig / ListPreferences / Theme）でラップする。
 * `/dashboard/*`（業務機能ページ）と `/home`（ログイン後の着地・dashboard-0006）で共有する。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PermissionsProvider>
        <SystemConfigProvider>
          <ListPreferencesProvider>
            <ThemeApplier />
            <AppShellContent>{children}</AppShellContent>
          </ListPreferencesProvider>
        </SystemConfigProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}
