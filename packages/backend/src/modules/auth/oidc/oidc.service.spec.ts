import { InternalServerErrorException } from '@nestjs/common';
import * as client from 'openid-client';
import { OidcService } from './oidc.service';

// openid-client は ESM-only（v6）。auto-mock は実体ロードを伴い jest(CJS) で parse エラーになるため、
// factory 形式で必要 export だけを差し替える（実体は一切読み込まれない）。
jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  randomState: jest.fn(),
  randomNonce: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  fetchUserInfo: jest.fn(),
  allowInsecureRequests: Symbol('allowInsecureRequests'),
}));

const ENV: Record<string, string> = {
  OIDC_ISSUER: 'http://localhost:3011',
  OIDC_CLIENT_ID: 'reference',
  OIDC_CLIENT_SECRET: 'reference-secret',
  OIDC_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/oidc/callback',
};

/**
 * resetMocks/restoreMocks 環境では jest.fn() 関数そのものが剥がれる。OidcService は getOrThrow を
 * constructor 後の discover → buildAuthRequest パスで参照するため、参照ごと beforeEach で貼り直す
 * ＝ref-0045。
 */
let mockConfigService: { getOrThrow: jest.Mock };

const fakeConfig = { __config: true } as unknown as Awaited<ReturnType<typeof client.discovery>>;

describe('OidcService', () => {
  let service: OidcService;

  beforeEach(() => {
    mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        const value = ENV[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      }),
    };
    service = new OidcService(mockConfigService as any);
    (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
    // restoreMocks により buildAuthRequest 系の mock 実装は毎テスト剥がれるので外側 beforeEach で張り直す
    // （ref-0045＝cmn-0215 の横展開。describe 内 beforeEach だと restoreMocks に先回りされて落ちる）。
    (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier-123');
    (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge-abc');
    (client.randomState as jest.Mock).mockReturnValue('state-xyz');
    (client.randomNonce as jest.Mock).mockReturnValue('nonce-xyz');
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('http://localhost:3011/authorize?client_id=reference'),
    );
  });

  describe('buildAuthRequest', () => {
    it('PKCE/state/nonce を生成し authorize URL を組み立てて返すこと（通常ログイン）', async () => {
      const result = await service.buildAuthRequest();

      expect(result).toEqual({
        url: 'http://localhost:3011/authorize?client_id=reference',
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: false,
        returnUrl: undefined,
      });
    });

    it('buildAuthorizationUrl に redirect_uri / scope / S256 challenge / state / nonce を渡すこと', async () => {
      await service.buildAuthRequest();

      expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
        fakeConfig,
        expect.objectContaining({
          redirect_uri: ENV.OIDC_REDIRECT_URI,
          scope: 'openid profile email',
          code_challenge: 'challenge-abc',
          code_challenge_method: 'S256',
          state: 'state-xyz',
          nonce: 'nonce-xyz',
        }),
      );
    });

    it('通常ログインでは prompt を含めずに authorize URL を組み立てること', async () => {
      await service.buildAuthRequest();

      expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
        fakeConfig,
        expect.not.objectContaining({ prompt: expect.anything() }),
      );
    });

    it('silent=true の時は prompt=none を付与して authorize URL を組み立てること', async () => {
      await service.buildAuthRequest({ silent: true });

      expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
        fakeConfig,
        expect.objectContaining({ prompt: 'none' }),
      );
    });

    it('silent=true + returnUrl 指定時は returnUrl を結果に含めること', async () => {
      const result = await service.buildAuthRequest({
        silent: true,
        returnUrl: '/announcements/123',
      });

      expect(result.silent).toBe(true);
      expect(result.returnUrl).toBe('/announcements/123');
    });

    it('discovery 結果をキャッシュし 2 回目は再 discovery しないこと', async () => {
      await service.buildAuthRequest();
      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledTimes(1);
    });

    describe('discovery 失敗時の negative cache（rete-auth-0006: DoS amplifier 対策）', () => {
      it('TTL(5秒)内の再呼び出しは discovery を再起動せず直前の失敗を再 throw すること', async () => {
        (client.discovery as jest.Mock).mockRejectedValueOnce(new Error('rete down'));
        jest.spyOn(Date, 'now').mockReturnValue(1_000);

        await expect(service.buildAuthRequest()).rejects.toThrow('rete down');

        jest.spyOn(Date, 'now').mockReturnValue(1_000 + 4_999);
        await expect(service.buildAuthRequest()).rejects.toThrow('rete down');

        expect(client.discovery).toHaveBeenCalledTimes(1);
      });

      it('TTL(5秒)経過後の呼び出しは discovery を再試行すること（rete 復帰耐性）', async () => {
        (client.discovery as jest.Mock)
          .mockRejectedValueOnce(new Error('rete down'))
          .mockResolvedValueOnce(fakeConfig);
        jest.spyOn(Date, 'now').mockReturnValue(1_000);

        await expect(service.buildAuthRequest()).rejects.toThrow('rete down');

        jest.spyOn(Date, 'now').mockReturnValue(1_000 + 5_000);
        await service.buildAuthRequest();

        expect(client.discovery).toHaveBeenCalledTimes(2);
      });

      it('discovery 成功時は negative cache を残さず従来通り永続キャッシュすること', async () => {
        (client.discovery as jest.Mock)
          .mockRejectedValueOnce(new Error('rete down'))
          .mockResolvedValueOnce(fakeConfig);
        jest.spyOn(Date, 'now').mockReturnValue(1_000);

        await expect(service.buildAuthRequest()).rejects.toThrow('rete down');

        jest.spyOn(Date, 'now').mockReturnValue(1_000 + 5_000);
        await service.buildAuthRequest();
        await service.buildAuthRequest();

        expect(client.discovery).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('handleCallback', () => {
    const checks = { state: 'state-xyz', nonce: 'nonce-xyz', codeVerifier: 'verifier-123' };
    const callbackUrl = new URL(
      'http://localhost:3001/api/v1/auth/oidc/callback?code=abc&state=state-xyz',
    );

    function mockTokens(claims: Record<string, unknown>) {
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        access_token: 'at-123',
        claims: () => claims,
      });
    }

    it('email/name を id_token ではなく UserInfo から取得すること（regression: 空 email 書き込み防止）', async () => {
      // rete（oidc-provider）は安全既定（conformIdTokenClaims）で profile/email を id_token に載せず
      // UserInfo でのみ返す。id_token は sub のみのことがある。
      mockTokens({ sub: 'acc-1' });
      (client.fetchUserInfo as jest.Mock).mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: '山田 太郎',
      });

      const result = await service.handleCallback(callbackUrl, checks);

      expect(client.fetchUserInfo).toHaveBeenCalledWith(fakeConfig, 'at-123', 'acc-1');
      expect(result).toEqual({ sub: 'acc-1', email: 'user@test.com', name: '山田 太郎' });
    });

    it('authorizationCodeGrant に PKCE/state/nonce 検証パラメータを渡すこと', async () => {
      mockTokens({ sub: 'acc-1' });
      (client.fetchUserInfo as jest.Mock).mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'X',
      });

      await service.handleCallback(callbackUrl, checks);

      expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
        fakeConfig,
        callbackUrl,
        expect.objectContaining({
          pkceCodeVerifier: 'verifier-123',
          expectedState: 'state-xyz',
          expectedNonce: 'nonce-xyz',
          idTokenExpected: true,
        }),
      );
    });

    it('UserInfo の name 欠落時は email を表示名に流用すること', async () => {
      mockTokens({ sub: 'acc-1' });
      (client.fetchUserInfo as jest.Mock).mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
      });

      const result = await service.handleCallback(callbackUrl, checks);

      expect(result.name).toBe('user@test.com');
    });

    it('UserInfo に email が無い場合は InternalServerErrorException をスローすること（空ユーザー生成を防ぐ fail-fast）', async () => {
      mockTokens({ sub: 'acc-1' });
      (client.fetchUserInfo as jest.Mock).mockResolvedValue({ sub: 'acc-1' });

      await expect(service.handleCallback(callbackUrl, checks)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('sub claim が無い場合 UserInfo を呼ばず InternalServerErrorException をスローすること', async () => {
      mockTokens({});

      await expect(service.handleCallback(callbackUrl, checks)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(client.fetchUserInfo).not.toHaveBeenCalled();
    });

    it('access_token が無い場合 UserInfo を呼ばず InternalServerErrorException をスローすること', async () => {
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'acc-1' }),
      });

      await expect(service.handleCallback(callbackUrl, checks)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(client.fetchUserInfo).not.toHaveBeenCalled();
    });
  });

  /**
   * security-reviewer MED #7: dev insecure 許可（allowInsecureRequests）を localhost/127.0.0.1 限定に狭める。
   * LAN 経由の http issuer（192.168.x.x 等）や LAN 経由のドメイン http は PKCE verifier sniff 余地を
   * 不必要に広げるため、insecure 許可対象外。https の issuer は無関係に insecure 許可対象外。
   */
  describe('discover の insecure 許可 (localhost/127.0.0.1 限定)', () => {
    const originalIssuer = ENV.OIDC_ISSUER;

    afterEach(() => {
      ENV.OIDC_ISSUER = originalIssuer;
    });

    it('localhost の http issuer には allowInsecureRequests を渡す', async () => {
      ENV.OIDC_ISSUER = 'http://localhost:3011';
      // 新しいインスタンスで configPromise をクリア
      service = new OidcService(mockConfigService as any);
      (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
      (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier');
      (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge');
      (client.randomState as jest.Mock).mockReturnValue('state');
      (client.randomNonce as jest.Mock).mockReturnValue('nonce');
      (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        new URL('http://localhost:3011/authorize'),
      );

      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledTimes(1);
      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(String),
        expect.any(String),
        undefined,
        expect.objectContaining({ execute: expect.any(Array) }),
      );
    });

    it('127.0.0.1 の http issuer には allowInsecureRequests を渡す', async () => {
      ENV.OIDC_ISSUER = 'http://127.0.0.1:3011';
      service = new OidcService(mockConfigService as any);
      (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
      (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier');
      (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge');
      (client.randomState as jest.Mock).mockReturnValue('state');
      (client.randomNonce as jest.Mock).mockReturnValue('nonce');
      (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        new URL('http://127.0.0.1:3011/authorize'),
      );

      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(String),
        expect.any(String),
        undefined,
        expect.objectContaining({ execute: expect.any(Array) }),
      );
    });

    it('IPv6 loopback [::1] の http issuer には allowInsecureRequests を渡す（L-5: 127.0.0.1 と等価の自ホスト loopback）', async () => {
      ENV.OIDC_ISSUER = 'http://[::1]:3011';
      service = new OidcService(mockConfigService as any);
      (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
      (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier');
      (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge');
      (client.randomState as jest.Mock).mockReturnValue('state');
      (client.randomNonce as jest.Mock).mockReturnValue('nonce');
      (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        new URL('http://[::1]:3011/authorize'),
      );

      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledTimes(1);
      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(String),
        expect.any(String),
        undefined,
        expect.objectContaining({ execute: expect.any(Array) }),
      );
    });

    it('LAN の http issuer (192.168.x.x) には allowInsecureRequests を渡さない（PKCE sniff 余地を狭める）', async () => {
      ENV.OIDC_ISSUER = 'http://192.168.1.5:3011';
      service = new OidcService(mockConfigService as any);
      (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
      (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier');
      (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge');
      (client.randomState as jest.Mock).mockReturnValue('state');
      (client.randomNonce as jest.Mock).mockReturnValue('nonce');
      (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        new URL('http://192.168.1.5:3011/authorize'),
      );

      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(String),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('LAN 経由のドメイン http (example.com) には allowInsecureRequests を渡さない', async () => {
      ENV.OIDC_ISSUER = 'http://example.com:3011';
      service = new OidcService(mockConfigService as any);
      (client.discovery as jest.Mock).mockResolvedValue(fakeConfig);
      (client.randomPKCECodeVerifier as jest.Mock).mockReturnValue('verifier');
      (client.calculatePKCECodeChallenge as jest.Mock).mockResolvedValue('challenge');
      (client.randomState as jest.Mock).mockReturnValue('state');
      (client.randomNonce as jest.Mock).mockReturnValue('nonce');
      (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        new URL('http://example.com:3011/authorize'),
      );

      await service.buildAuthRequest();

      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(String),
        expect.any(String),
        undefined,
        undefined,
      );
    });
  });
});
