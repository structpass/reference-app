import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('apiClientがインポートできること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient).toBeDefined();
  });

  it('withCredentials: trueが設定されていること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('baseURLが設定されていること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient.defaults.baseURL).toBeDefined();
  });

  it('Content-Typeがapplication/jsonに設定されていること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  describe('buildSilentLoginRedirect', () => {
    it('NEXT_PUBLIC_API_URL をベースに silent-login エンドポイントと return クエリを組み立てること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('/announcements/123')).toBe(
        'http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fannouncements%2F123',
      );
    });

    it('baseURL の末尾スラッシュを除去して連結すること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1/');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('/foo')).toBe(
        'http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Ffoo',
      );
    });

    it('currentPath が空文字や先頭 / 無しの場合は "/" をフォールバックすること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('')).toContain('return=%2F');
      expect(buildSilentLoginRedirect('foo')).toContain('return=%2F');
    });

    it('search を含んだ現在地 (pathname + search) をエンコードして付与できること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('/announcements/123?q=hello world')).toBe(
        'http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fannouncements%2F123%3Fq%3Dhello%20world',
      );
    });

    it('hash（fragment / アンカー位置）を含めた現在地をエンコードして付与できること（c2: アンカー復帰）', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('/announcements/123#section-2')).toBe(
        'http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fannouncements%2F123%23section-2',
      );
    });

    it('path + search + hash 全てを含めた現在地をエンコードして付与できること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const { buildSilentLoginRedirect } = await import('@/lib/api-client');
      expect(buildSilentLoginRedirect('/stocks?q=apple#top')).toBe(
        'http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fstocks%3Fq%3Dapple%23top',
      );
    });
  });

  describe('shouldSkipSilentLogin', () => {
    it('/auth/me は silent-login に流すこと（silent SSO の主発火点・HIGH #1 regression）', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin('auth/me')).toBe(false);
      expect(shouldSkipSilentLogin('/auth/me')).toBe(false);
    });

    it('/auth/login は silent-login を抑止し呼び元に 401 を返すこと（credentials 誤り等）', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin('auth/login')).toBe(true);
      expect(shouldSkipSilentLogin('/auth/login')).toBe(true);
    });

    it('credentials 系 endpoint (register / oauth-token / password-reset / forgot-password) は silent-login 抑止', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin('auth/register')).toBe(true);
      expect(shouldSkipSilentLogin('auth/oauth-token')).toBe(true);
      expect(shouldSkipSilentLogin('auth/password-reset')).toBe(true);
      expect(shouldSkipSilentLogin('auth/forgot-password')).toBe(true);
    });

    it('/auth/oidc/silent-login 自身は silent-login を再起動しない（二重起動・無限ループ回避）', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin('auth/oidc/silent-login')).toBe(true);
      expect(shouldSkipSilentLogin('auth/oidc/silent-login?return=/foo')).toBe(true);
    });

    it('業務 endpoint は silent-login に流すこと', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin('announcements/123')).toBe(false);
      expect(shouldSkipSilentLogin('stocks')).toBe(false);
    });

    it('url が undefined や空文字の時は skip しない（Info がない以上 silent-login 側に倒す）', async () => {
      const { shouldSkipSilentLogin } = await import('@/lib/api-client');
      expect(shouldSkipSilentLogin(undefined)).toBe(false);
      expect(shouldSkipSilentLogin('')).toBe(false);
    });
  });

  describe('401 レスポンスインターセプタ', () => {
    /**
     * インターセプタは axios のインスタンスに対して登録されるので、テストではインスタンスを
     * 取得して response.use の onRejected を直接呼び出す（response はないのでモックを作る）。
     */
    async function invokeOnRejected(errorObj: unknown): Promise<unknown> {
      const { default: apiClient } = await import('@/lib/api-client');
      const handlers = (
        apiClient.interceptors.response as unknown as {
          handlers: Array<{ rejected: (err: unknown) => unknown } | null>;
        }
      ).handlers.filter(Boolean) as Array<{ rejected: (err: unknown) => unknown }>;
      // interceptor chain は api-axios のデフォルトで登録されるため、最後の要素が我々の handler。
      const ourHandler = handlers[handlers.length - 1];
      return await ourHandler.rejected(errorObj);
    }

    function setWindowLocation(pathname: string, search = '', hash = '') {
      const fakeWindow = {
        location: {
          pathname,
          search,
          hash,
          href: '',
        },
      } as unknown as Window & typeof globalThis;
      // axios は typeof window で SSR 判定するので注入
      (globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow;
      return fakeWindow;
    }

    it('401 応答時に window.location.href を silent-login の URL に書き換えること', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/announcements/123');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/announcements/123' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toContain('/auth/oidc/silent-login?return=%2Fannouncements%2F123');
    });

    it('/login 系統にいる時は silent-login を再発火しない（無限ループ抑止）', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/login');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/announcements/123' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });

    it('/Login (大文字混在) の pathname でも silent-login を再発火しないこと (c1: 大文字小文字対応の防御)', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/Login');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/announcements/123' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });

    it('/LOGIN/sub のような大文字小文字混在の /login 配下パスでも silent-login を再発火しないこと', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/LOGIN/callback');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/x' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });

    it('401 応答時に window.location.hash（fragment）を silent-login の return に含めること（c2: アンカー復帰）', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/announcements/123', '', '#section-2');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/announcements/123' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toContain(
        '/auth/oidc/silent-login?return=%2Fannouncements%2F123%23section-2',
      );
    });

    it('/login 配下のパス（例 /login/sub）でも再発火しないこと', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/login/callback');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/x' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });

    it('/auth/me の 401 は silent-login に流れること（silent SSO の主発火点・HIGH #1 regression）', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/home');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/auth/me' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toContain('auth/oidc/silent-login?return=%2Fhome');
    });

    it('/auth/login の 401 は silent-login にせず reject で返すこと', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/login');
      const errorObj = {
        response: { status: 401 },
        config: { url: '/auth/login' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });

    it('SSR (typeof window === "undefined") 時は redirect せず reject で返すこと', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      (globalThis as { window?: unknown }).window = undefined;
      const errorObj = {
        response: { status: 401 },
        config: { url: '/x' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
    });

    it('401 以外のステータスでは redirect しないこと', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/v1');
      const w = setWindowLocation('/home');
      const errorObj = {
        response: { status: 500 },
        config: { url: '/x' },
      };

      await expect(invokeOnRejected(errorObj)).rejects.toBe(errorObj);
      expect(w.location.href).toBe('');
    });
  });
});
