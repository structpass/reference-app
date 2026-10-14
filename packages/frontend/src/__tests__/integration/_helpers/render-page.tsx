import { vi } from 'vitest';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { User } from '@struct-pass/shared';
import { AuthContext, type AuthContextType } from '@/features/auth/hooks/use-auth';
import { PermissionsProvider } from '@/contexts/permissions-provider';

/**
 * Integration test 用の render ラッパー。
 *
 * 本番では `<DashboardLayout>` が `<AuthProvider> → <PermissionsProvider>` を提供するため、
 * 各 page component が直接 `useAuth()` / `usePermissions()` を呼べる。
 * Integration test では page 単体を render するため、ここで両 Provider を補う。
 *
 * - AuthContext.Provider: SYS_ADMIN ユーザーを固定で流し込む（権限縮退ページ等のテスト互換性のため）
 * - PermissionsProvider: 本物を使い、MSW の `allPermissionsHandler` を介して
 *   `/permissions/my-permissions` を mock 経由で読む。
 *
 * 「権限なし」を検証したい spec は従来通り `server.use(deniedPermissionsHandler)` で
 * override すれば、PermissionsProvider 自体は素のまま使い回せる。
 */
const fakeUser: User = {
  id: 'test-user',
  name: 'tester',
  email: 'tester@example.com',
  role: 'SYS_ADMIN' as User['role'],
  isActive: true,
  oidcLinked: true,
  allowOidcLink: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const fakeAuth: AuthContextType = {
  user: fakeUser,
  loading: false,
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={fakeAuth}>
      <PermissionsProvider>{children}</PermissionsProvider>
    </AuthContext.Provider>
  );
}

/**
 * 呼び出し元のロールを差し替えて render する（v2-426: ロールで表示が変わる画面の検証用）。
 * 既定の `render` は SYS_ADMIN 固定なので、非 SYS_ADMIN の見え方を確かめる時に使う。
 */
export function renderWithRole(role: User['role'], ui: React.ReactElement) {
  const auth: AuthContextType = { ...fakeAuth, user: { ...fakeUser, role } };
  return rtlRender(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={auth}>
        <PermissionsProvider>{children}</PermissionsProvider>
      </AuthContext.Provider>
    ),
  });
}

export function renderWithPermissions(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return rtlRender(ui, { wrapper: TestProviders, ...options });
}

// 利便性のため、call site で `render(...)` のまま使えるよう alias で再 export する。
// `export *` だと `@testing-library/react` の素の `render` が勝つため、
// 後段で個別に override する。
// NOTE: 下の re-export に `render` を含めないこと（含めると素の RTL render が勝つ）。
export { screen, waitFor, within, act, fireEvent, cleanup } from '@testing-library/react';
export const render = renderWithPermissions;
