import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * v2-420: 接続先 URL のスキーム検証（多層防御）。
 *
 * ビルド時 env の汚染で危険スキームが遷移先へ焼き込まれるのを入口で弾く。
 * 点検で「ガードが定義済みの箇所と未配線の箇所が混在していた」ことが指摘されたため、
 * 共通の url-guard へ寄せ、全経路が同じ入口を通ることを固定する。
 */
describe('url-guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('isHttpUrl', () => {
    it('http / https の絶対 URL を許可すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('http://localhost:3001/api/v1')).toBe(true);
      expect(isHttpUrl('https://api.example.com/api/v1')).toBe(true);
      expect(isHttpUrl('https://rete.example.com')).toBe(true);
    });

    it('大文字スキーム（HTTP:// / HTTPS://）も許可すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('HTTP://example.com')).toBe(true);
      expect(isHttpUrl('Https://example.com')).toBe(true);
    });

    it('スキームは大文字小文字を区別しない（RFC 3986）。大文字の危険スキームは引き続き拒否すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      // http/https は大文字でも正当な URL（new URL('HTTP://A.COM') は http: へ正規化される）。
      // 変更前のインラインガード（/i 無し）は大文字スキームを既定値へ落としていたため、
      // ここは「受け入れる方向」の意図的な差である（危険側へは広がらない）。
      expect(isHttpUrl('HTTP://example.com')).toBe(true);
      expect(isHttpUrl('HTTPS://example.com')).toBe(true);
      // 危険スキームは大文字にしても拒否される（/i は http/https の受理だけを広げる）
      expect(isHttpUrl('JAVASCRIPT:alert(1)')).toBe(false);
      expect(isHttpUrl('JavaScript:alert(1)')).toBe(false);
      expect(isHttpUrl('JaVaScRiPt:alert(1)')).toBe(false);
      expect(isHttpUrl('DATA:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isHttpUrl('VBSCRIPT:msgbox(1)')).toBe(false);
    });

    it('大文字の危険スキームはブラウザでも危険スキームとして解釈されること（拒否が必要な理由）', async () => {
      // 回帰防止: new URL('JavaScript:alert(1)') は protocol='javascript:' になる。
      // つまり大文字でも危険であり、/i 付きの正規表現で http/https だけを通す必要がある。
      expect(new URL('JavaScript:alert(1)').protocol).toBe('javascript:');
      expect(new URL('HTTP://A.COM').protocol).toBe('http:');
    });

    it('javascript: スキームを拒否すること（本命の防御）', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isHttpUrl('JavaScript:alert(1)')).toBe(false);
      // 前後に空白を付けても通過しない（先頭空白を許すと回避になる）
      expect(isHttpUrl(' javascript:alert(1)')).toBe(false);
      expect(isHttpUrl('\tjavascript:alert(1)')).toBe(false);
    });

    it('その他の危険スキームを拒否すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isHttpUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isHttpUrl('blob:https://example.com/uuid')).toBe(false);
    });

    it('プロトコル相対（//evil.example.com）を拒否すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('//evil.example.com')).toBe(false);
    });

    it('相対パス・空・未定義を拒否すること', async () => {
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('/api/v1')).toBe(false);
      expect(isHttpUrl('api/v1')).toBe(false);
      expect(isHttpUrl('')).toBe(false);
      expect(isHttpUrl('   ')).toBe(false);
      expect(isHttpUrl(undefined)).toBe(false);
      expect(isHttpUrl(null)).toBe(false);
    });

    it('javascript: を new URL でパースできてしまうことの確認（この判定を new URL に置き換えない）', async () => {
      // 回帰防止: new URL('javascript:alert(1)') は成功するため、スキーム判定の代用にならない。
      expect(() => new URL('javascript:alert(1)')).not.toThrow();
      const { isHttpUrl } = await import('@/lib/url-guard');
      expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('resolveHttpUrl', () => {
    it('http(s) の値はそのまま返すこと', async () => {
      const { resolveHttpUrl } = await import('@/lib/url-guard');
      expect(resolveHttpUrl('https://api.example.com', 'http://localhost:3001')).toBe(
        'https://api.example.com',
      );
    });

    it('危険スキームは fallback を返すこと', async () => {
      const { resolveHttpUrl } = await import('@/lib/url-guard');
      expect(resolveHttpUrl('javascript:alert(1)', 'http://localhost:3001')).toBe(
        'http://localhost:3001',
      );
    });

    it('未定義・空文字は fallback を返すこと', async () => {
      const { resolveHttpUrl } = await import('@/lib/url-guard');
      expect(resolveHttpUrl(undefined, 'http://localhost:3001')).toBe('http://localhost:3001');
      expect(resolveHttpUrl('', 'http://localhost:3001')).toBe('http://localhost:3001');
    });
  });
});

/**
 * 各接続先が実際にガードを通っていること（配線の固定）。
 * 「定義はあるが配線されていない」状態をテストで検出できるようにする。
 */
describe('接続先 URL のガード配線（v2-420）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('api-client: NEXT_PUBLIC_API_URL が危険スキームなら既定値へフォールバックすること', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'javascript:alert(1)');
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3001/api/v1');
  });

  it('api-client: buildSilentLoginRedirect が危険スキームで外部へ飛ばさないこと', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'javascript:alert(1)');
    const { buildSilentLoginRedirect } = await import('@/lib/api-client');
    const url = buildSilentLoginRedirect('/home');
    expect(url.startsWith('javascript:')).toBe(false);
    expect(url).toBe('http://localhost:3001/api/v1/auth/oidc/silent-login?return=%2Fhome');
  });

  it('api-client: 正常な NEXT_PUBLIC_API_URL は従来どおり使われること', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/v1');
    const { default: apiClient, buildSilentLoginRedirect } = await import('@/lib/api-client');
    expect(apiClient.defaults.baseURL).toBe('https://api.example.com/api/v1');
    expect(buildSilentLoginRedirect('/home')).toBe(
      'https://api.example.com/api/v1/auth/oidc/silent-login?return=%2Fhome',
    );
  });

  it('rete-display-preference: NEXT_PUBLIC_RETE_API_URL が危険スキームなら既定値へ落ちること', async () => {
    vi.stubEnv('NEXT_PUBLIC_RETE_API_URL', 'javascript:alert(1)');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchReteDisplayPreference } = await import('@/lib/rete-display-preference');
    await fetchReteDisplayPreference();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(calledUrl.startsWith('javascript:')).toBe(false);
    expect(calledUrl.startsWith('http://localhost:3011/api/v1')).toBe(true);
  });
});
