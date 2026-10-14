import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';

const mockGet = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from 'react-hot-toast';

describe('LoginPage (SSO)', () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null);

    // window.location.href への代入（自動SSOリダイレクト発火）を監視する。
    hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(value: string) {
          hrefSetter(value);
        },
      },
    });
  });

  it('?error=sso のとき「SSO でログインし直す」リンクを描画し、oidc/login への導線を持つこと', () => {
    mockGet.mockImplementation((key: string) => (key === 'error' ? 'sso' : null));

    render(<LoginPage />);

    const link = screen.getByRole('link', { name: 'SSO でログインし直す' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth/oidc/login'));
  });

  it('正常時は遷移中メッセージもリンクも描画しないこと（desk-0145）', () => {
    render(<LoginPage />);

    expect(screen.queryByText(/移動しています/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('フラグ無し時は従来通り自動SSOリダイレクトが発火すること', () => {
    render(<LoginPage />);

    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining('/auth/oidc/login'));
  });

  it('パスワード入力欄を描画しないこと', () => {
    render(<LoginPage />);

    expect(screen.queryByLabelText(/パスワード/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ユーザー名/)).not.toBeInTheDocument();
  });

  it('?error=sso のときエラートーストを表示すること', () => {
    mockGet.mockImplementation((key: string) => (key === 'error' ? 'sso' : null));

    render(<LoginPage />);

    expect(toast.error).toHaveBeenCalledWith('SSO ログインに失敗しました。再度お試しください。');
  });

  it('error クエリがないときはトーストを出さないこと', () => {
    render(<LoginPage />);

    expect(toast.error).not.toHaveBeenCalled();
  });

  // v2-420: 接続先 URL のスキーム検証が配線されていること（定義だけで効いていない状態を防ぐ）。
  describe('接続先 URL のスキーム検証（v2-420）', () => {
    it('NEXT_PUBLIC_API_URL が危険スキームの時、自動遷移が javascript: へ飛ばないこと', async () => {
      vi.resetModules();
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'javascript:alert(1)');
      const { default: GuardedLoginPage } = await import('@/app/login/page');

      render(<GuardedLoginPage />);

      expect(hrefSetter).toHaveBeenCalled();
      const target = String(hrefSetter.mock.calls[0][0]);
      expect(target.startsWith('javascript:')).toBe(false);
      expect(target).toBe('http://localhost:3001/api/v1/auth/oidc/login');
      vi.unstubAllEnvs();
    });

    it('NEXT_PUBLIC_API_URL が危険スキームの時、再ログインリンクの href も javascript: にならないこと', async () => {
      vi.resetModules();
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'javascript:alert(1)');
      mockGet.mockImplementation((key: string) => (key === 'error' ? 'sso' : null));
      const { default: GuardedLoginPage } = await import('@/app/login/page');

      render(<GuardedLoginPage />);

      const link = screen.getByRole('link', { name: 'SSO でログインし直す' });
      expect(link.getAttribute('href')?.startsWith('javascript:')).toBe(false);
      expect(link).toHaveAttribute('href', 'http://localhost:3001/api/v1/auth/oidc/login');
      vi.unstubAllEnvs();
    });

    it('正常な NEXT_PUBLIC_API_URL は従来どおり遷移先に使われること', async () => {
      vi.resetModules();
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/v1');
      const { default: GuardedLoginPage } = await import('@/app/login/page');

      render(<GuardedLoginPage />);

      expect(hrefSetter).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/oidc/login');
      vi.unstubAllEnvs();
    });
  });
});
