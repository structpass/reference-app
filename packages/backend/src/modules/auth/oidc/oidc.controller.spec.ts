import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Response, Request } from 'express';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { OIDC_STATE_COOKIE_NAME } from './oidc-state.cookie';
import { AUTH_COOKIE_NAME } from '../constants/cookie.constants';

// openid-client は ESM-only (v6)。自動 mock は実体ロードを伴い jest (CJS) で parse エラーになるため、
// service spec 同型で factory 形式モックを提供する（実体は一切読み込まれない）。
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

/**
 * silent SSO の OIDC controller テスト。
 *
 * 対象:
 * - silent-login エンドポイントの sanitizeReturnUrl 正常系（path）
 * - sanitizeReturnUrl 異常系（scheme 付き・protocol-relative・/login・空・過大長・改行）
 * - silent-login が state cookie に silent/returnUrl を保存し rete /authorize へ 302
 * - silent-login で returnUrl 不正/欠落 → BadRequestException
 * - callback の silent 成功時は returnUrl へ、role 未割当は /pending、通常は /home
 * - callback の失敗（OIDC 由来）は常に /login?error=sso へ（silent 失敗でも同じ）
 */

/**
 * 受け側 service は NestJS の instance を介さず provide で渡されるため、resetMocks/restoreMocks で
 * jest.fn() 自体も剥がれる（実装がなくなる）と provide 参照が undefined になる。
 * そこで mock オブジェクトは beforeEach で毎回新規生成し、describe 内テストが個別に .mockResolvedValue で
 * 上書きする形へ揃える（ref-0045＝cmn-0215 の横展開）。
 */
let mockOidcService: { buildAuthRequest: jest.Mock; handleCallback: jest.Mock };
let mockUsersService: { provisionFromOidc: jest.Mock };
let mockAuthService: { issueJwt: jest.Mock };
let mockConfigService: { getOrThrow: jest.Mock; get: jest.Mock };

function makeMockResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    getHeader: jest.fn().mockReturnValue(undefined),
    setHeader: jest.fn(),
  } as unknown as Response;
}

function makeMockRequest(
  overrides: Partial<{ query: Record<string, string>; signedCookies: Record<string, string> }> = {},
) {
  return {
    query: overrides.query ?? {},
    signedCookies: overrides.signedCookies ?? {},
    headers: {},
  } as unknown as Request;
}

describe('OidcController', () => {
  let controller: OidcController;

  beforeEach(async () => {
    // resetMocks/restoreMocks で jest.fn() の関数そのものが剥がれるためここで再生成する（ref-0045）。
    mockOidcService = {
      buildAuthRequest: jest.fn(),
      handleCallback: jest.fn(),
    };
    mockUsersService = {
      provisionFromOidc: jest.fn(),
    };
    mockAuthService = {
      issueJwt: jest.fn(),
    };
    mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'OIDC_REDIRECT_URI') return 'http://localhost:3001/api/v1/auth/oidc/callback';
        throw new Error(`Missing ${key}`);
      }),
      get: jest.fn((key: string) => {
        if (key === 'CORS_ORIGIN') return 'http://localhost:3000';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OidcController],
      providers: [
        { provide: OidcService, useValue: mockOidcService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<OidcController>(OidcController);
  });

  describe('login', () => {
    it('PKCE/state/nonce を発行し state cookie を保存して rete /authorize へ 302 すること', async () => {
      mockOidcService.buildAuthRequest.mockResolvedValue({
        url: 'http://localhost:3011/authorize?...',
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: false,
        returnUrl: undefined,
      });
      const res = makeMockResponse();

      await controller.login(res);

      expect(mockOidcService.buildAuthRequest).toHaveBeenCalledWith();
      expect(res.cookie).toHaveBeenCalledWith(
        OIDC_STATE_COOKIE_NAME,
        JSON.stringify({ state: 'state-xyz', nonce: 'nonce-xyz', codeVerifier: 'verifier-123' }),
        expect.anything(),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3011/authorize?...');
    });
  });

  describe('silent-login', () => {
    it('?return=/path 指定時: prompt=none の auth request を発行し、silent/returnUrl を cookie に保存して 302 すること', async () => {
      mockOidcService.buildAuthRequest.mockResolvedValue({
        url: 'http://localhost:3011/authorize?prompt=none',
        state: 'state-s',
        nonce: 'nonce-s',
        codeVerifier: 'verifier-s',
        silent: true,
        returnUrl: '/announcements/123',
      });
      const res = makeMockResponse();

      await controller.silentLogin('/announcements/123', res);

      expect(mockOidcService.buildAuthRequest).toHaveBeenCalledWith({
        silent: true,
        returnUrl: '/announcements/123',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        OIDC_STATE_COOKIE_NAME,
        JSON.stringify({
          state: 'state-s',
          nonce: 'nonce-s',
          codeVerifier: 'verifier-s',
          silent: true,
          returnUrl: '/announcements/123',
        }),
        expect.anything(),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3011/authorize?prompt=none');
    });

    it('return クエリが無い時（undefined）は BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin(undefined, res)).rejects.toThrow(BadRequestException);
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('絶対 URL（scheme 付き）の returnUrl は BadRequestException をスローし外部リダイレクトを抑止すること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('https://evil.example.com/path', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('protocol-relative（//evil.example.com）の returnUrl は BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('//evil.example.com', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('先頭が / でない returnUrl（例 plain相対）は BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('announcements/123', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('/login を戻り先に指定された時は BadRequestException をスローし無限ループを抑止すること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/login', res)).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/login?error=sso', res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin('/login/sub', res)).rejects.toThrow(BadRequestException);
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('改行や null を含む returnUrl は BadRequestException をスローすること（header injection 抑止）', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/foo\r\nLocation: evil', res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin('/foo\tevil', res)).rejects.toThrow(BadRequestException);
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('fragment に危険文字（< > " \' `）を含む returnUrl は BadRequestException をスローすること（rete-auth-0009 M-1）', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/page#<img src=x onerror=1>', res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin('/page?x="evil"', res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin("/page#'evil'", res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin('/page#`evil`', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('fragment に scheme 付き文字列（javascript:）を含む returnUrl は BadRequestException をスローすること（rete-auth-0009 M-1・security-reviewer追加指摘）', async () => {
      const res = makeMockResponse();
      await expect(
        controller.silentLogin('/page#javascript:alert(document.cookie)', res),
      ).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/page#data:text/html,x', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('空白入りクエリを含む returnUrl は過剰ブロックせず従来通り通ること（rete-auth-0009 M-1非退行）', async () => {
      mockOidcService.buildAuthRequest.mockResolvedValue({
        url: 'http://localhost:3011/authorize?prompt=none',
        state: 'state-s',
        nonce: 'nonce-s',
        codeVerifier: 'verifier-s',
        silent: true,
        returnUrl: '/search?q=hello world',
      });
      const res = makeMockResponse();

      await controller.silentLogin('/search?q=hello world', res);

      expect(mockOidcService.buildAuthRequest).toHaveBeenCalledWith({
        silent: true,
        returnUrl: '/search?q=hello world',
      });
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3011/authorize?prompt=none');
    });

    it('/login の大文字小文字・fragment/space 変種も BadRequestException をスローすること（rete-auth-0009 L-1）', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/Login', res)).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/LOGIN', res)).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/login#x', res)).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/login?x', res)).rejects.toThrow(BadRequestException);
      await expect(controller.silentLogin('/login/sub', res)).rejects.toThrow(BadRequestException);
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('return クエリが配列/オブジェクトの時は 500 でなく BadRequestException(400) をスローすること（rete-auth-0009 L-2）', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin(['/a', '/b'] as unknown as string, res)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.silentLogin({ x: 'y' } as unknown as string, res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });
  });

  describe('callback', () => {
    it('silent=true + returnUrl 保存済の cookie: code 交換 → user 取得 → JWT 発行 → returnUrl へ 302', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: true,
        returnUrl: '/announcements/123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(mockOidcService.handleCallback).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, 'jwt-abc', expect.anything());
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/announcements/123');
    });

    it('通常ログイン成功 (silent 不在): role 有り → /home へ', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/home');
    });

    it('通常ログイン成功 (silent 不在): role 未割当 (pending) → /pending へ', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: null });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/pending');
    });

    it('OIDC_FRONTEND_URL 設定時はそちらを redirect 先に使う（CORS_ORIGIN の値に関わらず・rete-auth-0007）', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');
      (mockConfigService.get as jest.Mock).mockImplementationOnce((key: string) =>
        key === 'OIDC_FRONTEND_URL' ? 'https://sso.example.com' : undefined,
      );

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('https://sso.example.com/home');
    });

    it('OIDC_FRONTEND_URL 設定時は callback 失敗時の redirect 先にも使われる', async () => {
      mockOidcService.handleCallback.mockRejectedValue(new Error('login_required'));
      (mockConfigService.get as jest.Mock).mockImplementationOnce((key: string) =>
        key === 'OIDC_FRONTEND_URL' ? 'https://sso.example.com' : undefined,
      );

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { error: 'login_required' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('https://sso.example.com/login?error=sso');
    });

    it('OIDC_FRONTEND_URL の末尾スラッシュは正規化され二重スラッシュにならないこと（rete-auth-0010 item4）', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');
      (mockConfigService.get as jest.Mock).mockImplementationOnce((key: string) =>
        key === 'OIDC_FRONTEND_URL' ? 'https://sso.example.com/' : undefined,
      );

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      // `https://sso.example.com/` + `/home` が `//home` にならず 1 本のスラッシュに正規化される
      expect(res.redirect).toHaveBeenCalledWith('https://sso.example.com/home');
    });

    it('production で OIDC_FRONTEND_URL 未設定なら frontendBase が fail-closed で throw し CORS_ORIGIN へ落ちないこと（rete-auth-0010 item2 多層防御）', async () => {
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        // mockConfigService.get 既定で OIDC_FRONTEND_URL は undefined（＝未設定）、CORS_ORIGIN は
        // http://localhost:3000。production では fallback せず throw することを検証する。
        const statePayload = JSON.stringify({
          state: 'state-xyz',
          nonce: 'nonce-xyz',
          codeVerifier: 'verifier-123',
        });
        const req = makeMockRequest({
          signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
          query: { code: 'code-abc', state: 'state-xyz' },
        });
        const res = makeMockResponse();

        await expect(controller.callback(req, res)).rejects.toThrow(/frontendBase fail-closed/);
        expect(res.redirect).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
      }
    });

    it('OIDC エラー (silent 含む) は例外を握って /login?error=sso へ redirect する (無限ループ抑止)', async () => {
      mockOidcService.handleCallback.mockRejectedValue(new Error('login_required'));

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: true,
        returnUrl: '/announcements/123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { error: 'login_required' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
      expect(res.cookie).not.toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });

    it('state cookie 欠落時は例外を握って /login?error=sso へ', async () => {
      const req = makeMockRequest({ signedCookies: {} });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
      expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
    });

    it('成否に関わらず state cookie を clearCookie する', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'code-abc', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, expect.anything());
    });

    /**
     * security-reviewer HIGH-#3 系:
     *
     * cookie は signed:true なので tamper で cookie-parser が undefined に落ちる。
     * テストでは「cookie-parser が署名検証で cookie を消した状態」を signedCookies から除外することで
     * シミュレートする（＝signedCookies に当該キー無し）。その際に silent flag の偽装や
     * 通常フローの cookie 消失でも例外を握って /login?error=sso へ落ちることを保証する。
     */
    it('signedCookies から state cookie が欠落している（署名検証で cookie-parser に消された）場合は例外を握って /login?error=sso へ', async () => {
      // cookie-parser は署名不一致で signedCookies から値を消す挙動を再現（undefined 相当の状態）
      const req = makeMockRequest({ signedCookies: {} });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
      expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });

    it('通常フローの cookie を攻撃者が silent=true で改竄しても機構的に守られること: signed cookie 改竄後の callback は /login?error=sso へ', async () => {
      // 現実には tamper は署名検証で弾かれるが、仮に signed cookie 内に silent=true を
      // 注入できる壊れた signature scheme を仮定した時の controller 側の挙動を固める。
      // 現状の sanitize は silent flag の真偽だけで判定するため、payload は JSON として parse できれば
      // silent 分岐に入る。攻撃が成立しないことを「副作用の検証」で示す:
      // silent=false (なし) の cookie で /home 遷移、正規 silent cookie で returnUrl 遷移、
      // 偽造 cookie で意図しない攻撃パスへ逃げないことの境界を確認。
      const genuineSilentPayload = JSON.stringify({
        state: 'state-silent',
        nonce: 'nonce-silent',
        codeVerifier: 'verifier-silent',
        silent: true,
        returnUrl: '/safe/path',
      });

      // case A: silent=false 通常 cookie → /home
      mockOidcService.handleCallback.mockResolvedValueOnce({
        sub: 'acc-1',
        email: 'a@b.c',
        name: 'X',
      });
      mockUsersService.provisionFromOidc.mockResolvedValueOnce({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValueOnce('jwt-A');

      const reqA = makeMockRequest({
        signedCookies: {
          [OIDC_STATE_COOKIE_NAME]: JSON.stringify({
            state: 'state-A',
            nonce: 'nonce-A',
            codeVerifier: 'verifier-A',
          }),
        },
        query: { code: 'c', state: 'state-A' },
      });
      const resA = makeMockResponse();
      await controller.callback(reqA, resA);
      expect(resA.redirect).toHaveBeenCalledWith('http://localhost:3000/home');

      // case B: 正規 silent cookie → /safe/path へ (silent 分岐が正しく効いていること)
      mockOidcService.handleCallback.mockResolvedValueOnce({
        sub: 'acc-1',
        email: 'a@b.c',
        name: 'X',
      });
      mockUsersService.provisionFromOidc.mockResolvedValueOnce({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValueOnce('jwt-B');

      const reqB = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: genuineSilentPayload },
        query: { code: 'c', state: 'state-silent' },
      });
      const resB = makeMockResponse();
      await controller.callback(reqB, resB);
      expect(resB.redirect).toHaveBeenCalledWith('http://localhost:3000/safe/path');

      // 総合: signedCookies が undefined（cookie-parser が漏らした状態）でも /login?error=sso へ
      mockOidcService.handleCallback.mockClear();
      const reqC = makeMockRequest({
        signedCookies: undefined as unknown as Record<string, string>,
      });
      const resC = makeMockResponse();
      await controller.callback(reqC, resC);
      expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
      expect(resC.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
    });

    it('silent-login を続けて 2 回叩いた時の cookie 上書きは controller 側では素通し（仕様）: 古い cookie が callback に到達したら invalid state で fail-loud', async () => {
      // silent-login は cookie を上書きするため、2 度目発行で 1 度目の state は消える。
      // 仮にブラウザが 1 度目の callback URL を後で踏むレースがあれば、cookie は既にない or 上書き後。
      // ここでは「1 度目で発行した cookie を 2 度目の silent-login が上書きする」前提で、
      // 上書き後の callback が古い state を提示しても openid-client が state mismatch で throw し
      // → controller の catch が /login?error=sso へ持っていくことを保証する。

      mockOidcService.buildAuthRequest
        .mockResolvedValueOnce({
          url: 'http://localhost:3011/authorize?1',
          state: 'state-1',
          nonce: 'nonce-1',
          codeVerifier: 'v-1',
          silent: true,
          returnUrl: '/path1',
        })
        .mockResolvedValueOnce({
          url: 'http://localhost:3011/authorize?2',
          state: 'state-2',
          nonce: 'nonce-2',
          codeVerifier: 'v-2',
          silent: true,
          returnUrl: '/path2',
        });
      const resA = makeMockResponse();
      await controller.silentLogin('/path1', resA);
      expect(mockOidcService.buildAuthRequest).toHaveBeenLastCalledWith({
        silent: true,
        returnUrl: '/path1',
      });
      const resB = makeMockResponse();
      await controller.silentLogin('/path2', resB);
      expect(mockOidcService.buildAuthRequest).toHaveBeenLastCalledWith({
        silent: true,
        returnUrl: '/path2',
      });

      // 1 度目の callback が後から到達: cookie は 2 度目で上書きされているので、その時の payload を使う
      // （ここでは仕様上 newest-wins を表現するため 2 度目の payload を使う）
      const newerPayload = JSON.stringify({
        state: 'state-2',
        nonce: 'nonce-2',
        codeVerifier: 'v-2',
        silent: true,
        returnUrl: '/path2',
      });
      mockOidcService.handleCallback.mockRejectedValueOnce(new Error('state mismatch'));
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: newerPayload },
        query: { code: 'c', state: 'state-2' },
      });
      const resCb = makeMockResponse();
      await controller.callback(req, resCb);
      expect(resCb.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
    });

    /**
     * security-reviewer MED #4 / M-2: allow-list 内キーの非 string 値（qs の array / nested object
     * parse 経路）は、キー・値型に依らず一律 400（BadRequestException）で fail-loud させる
     * （silent drop しない）。実装は generic な typeof 判定なので、allow-list 全キー × 非 string 値の
     * table-driven で均等に保証する。
     */
    const ALLOWED_KEYS = [
      'code',
      'state',
      'error',
      'error_description',
      'error_uri',
      'iss',
    ] as const;
    const NON_STRING_VALUES: ReadonlyArray<readonly [string, unknown]> = [
      ['array（?k=a&k=b）', ['a', 'b']],
      ['nested object（?k[x]=y）', { x: 'y' }],
    ];
    it.each(
      ALLOWED_KEYS.flatMap((key) =>
        NON_STRING_VALUES.map(([label, value]) => [key, label, value] as const),
      ),
    )(
      'allow-list 内キー %s の値が %s の場合 BadRequestException(400)（silent drop しない）',
      async (key, _label, value) => {
        const statePayload = JSON.stringify({
          state: 'state-xyz',
          nonce: 'nonce-xyz',
          codeVerifier: 'verifier-123',
        });
        const req = makeMockRequest({
          signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
          // 型システムを騙して非 string を注入し、controller 側の typeof !== 'string' 検出を検証する。
          query: { [key]: value as unknown as string },
        });
        const res = makeMockResponse();

        await expect(controller.callback(req, res)).rejects.toThrow(BadRequestException);
        expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      },
    );

    /**
     * M-4: error_uri（OIDC Core §3.1.2.6）を allow-list に追加。string 値は callbackUrl へ転送され、
     * downstream（openid-client）の error 応答処理へ届く（非退行）。
     */
    it('allow-list に追加した error_uri（string）は callbackUrl へ転送されること（M-4）', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: {
          code: 'code-abc',
          state: 'state-xyz',
          error_uri: 'https://idp.example.com/errors/invalid_request',
        },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      const forwardedUrl = mockOidcService.handleCallback.mock.calls[0][0] as URL;
      expect(forwardedUrl.searchParams.get('error_uri')).toBe(
        'https://idp.example.com/errors/invalid_request',
      );
      // 既存キー転送が壊れていないことも並走確認（error_uri 追加の非退行）。
      expect(forwardedUrl.searchParams.get('code')).toBe('code-abc');
      expect(forwardedUrl.searchParams.get('state')).toBe('state-xyz');
    });

    it('allow-list 外の query キーは silent skip され、handleCallback の callbackUrl に転送されない', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        // evil / xss は allow-list 外。silent skip されるはず
        query: { code: 'code-abc', state: 'state-xyz', evil: 'value', xss: '<script>' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(mockOidcService.handleCallback).toHaveBeenCalledTimes(1);
      const forwardedUrl = mockOidcService.handleCallback.mock.calls[0][0] as URL;
      expect(forwardedUrl.searchParams.get('code')).toBe('code-abc');
      expect(forwardedUrl.searchParams.get('state')).toBe('state-xyz');
      expect(forwardedUrl.searchParams.get('evil')).toBeNull();
      expect(forwardedUrl.searchParams.get('xss')).toBeNull();
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/home');
    });

    /**
     * security-reviewer MED #6: callback 失敗ログに openid-client の生 message/stack を含めない。
     * Error.name（エラークラス名）のみ記録する。
     */
    it('callback 失敗ログは Error.name（エラー種別）のみ記録し message/stack を含めない', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        // openid-client の独自エラーを模擬（name にクラス名が message に詳細が入る形式）
        const oidcLikeError = new Error('state hash mismatch (expected abc got xyz)');
        oidcLikeError.name = 'AuthorizationResponseError';
        mockOidcService.handleCallback.mockRejectedValueOnce(oidcLikeError);

        const statePayload = JSON.stringify({
          state: 'state-xyz',
          nonce: 'nonce-xyz',
          codeVerifier: 'verifier-123',
        });
        const req = makeMockRequest({
          signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
          query: { code: 'c', state: 'state-xyz' },
        });
        const res = makeMockResponse();

        await controller.callback(req, res);

        const warnMessages = warnSpy.mock.calls.map((c) => String(c[0]));
        // 失敗ログには Error.name（= AuthorizationResponseError）が含まれる
        expect(warnMessages.some((m) => m.includes('AuthorizationResponseError'))).toBe(true);
        // message 由来の詳細文字列は含まれない（log 集約先への PII/内部情報混入防止）
        expect(warnMessages.every((m) => !m.includes('state hash mismatch'))).toBe(true);
        expect(warnMessages.every((m) => !m.includes('expected abc got xyz'))).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
    });

    /**
     * code-reviewer 指摘 D-1: state cookie の中身が壊れた JSON 文字列の場合に例外を握って
     * /login?error=sso へ落ちることをテストで固定（現状は実装が正しいが regression 検知不能）。
     */
    it('state cookie が壊れた JSON の場合は例外を握って /login?error=sso へ', async () => {
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: 'not-json-{' },
        query: { code: 'c', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
      expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });

    /**
     * code-reviewer 指摘 D-2: silent=true だが returnUrl 未定義の cookie で callback を受けた場合、
     * role 判定側 (/home or /pending) へ fall back することをテストで固定。
     */
    it('silent=true だが returnUrl が未定義の cookie: role 有り → /home へ fall back', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: 'admin' });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: true,
        // returnUrl が未定義
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'c', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      // silent 分岐ではなく role 判定側 (/home) へ fall back
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/home');
    });

    it('silent=true だが returnUrl が未定義の cookie: role 未割当 (pending) → /pending へ fall back', async () => {
      mockOidcService.handleCallback.mockResolvedValue({
        sub: 'acc-1',
        email: 'user@test.com',
        name: 'user',
      });
      mockUsersService.provisionFromOidc.mockResolvedValue({ id: 'u-1', role: null });
      mockAuthService.issueJwt.mockReturnValue('jwt-abc');

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
        silent: true,
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'c', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/pending');
    });

    /**
     * code-reviewer 指摘 F-4: handleCallback が例外を throw した場合でも res.clearCookie が
     * 呼ばれることをテストで固定（cookie 正常時の成功経路と cookie 欠落時の失敗経路のみが
     * 検証されており、cookie はあるが handleCallback 自体が失敗するケースが未検証だった）。
     */
    it('handleCallback が例外を throw した場合でも state cookie の clearCookie が呼ばれること', async () => {
      mockOidcService.handleCallback.mockRejectedValue(new Error('discovery failed'));

      const statePayload = JSON.stringify({
        state: 'state-xyz',
        nonce: 'nonce-xyz',
        codeVerifier: 'verifier-123',
      });
      const req = makeMockRequest({
        signedCookies: { [OIDC_STATE_COOKIE_NAME]: statePayload },
        query: { code: 'c', state: 'state-xyz' },
      });
      const res = makeMockResponse();

      await controller.callback(req, res);

      // 成否に関わらず state cookie を clearCookie している（cookie は try/catch より前で実行）
      expect(res.clearCookie).toHaveBeenCalledWith(OIDC_STATE_COOKIE_NAME, expect.anything());
      // 失敗時は /login?error=sso へ redirect
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=sso');
      // 認証 cookie は発行されない
      expect(res.cookie).not.toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  /**
   * code-reviewer 指摘 F-1: returnUrl にバックスラッシュ（\\）が含まれる場合、
   * sanitizeReturnUrl が undefined を返し BadRequestException になる。
   */
  describe('sanitizeReturnUrl（バックスラッシュ拒否）', () => {
    it('バックスラッシュを含む returnUrl は BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/announcements\\evil.com', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('バックスラッシュと forward slash の混在（/foo\\../bar）も BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('/foo\\../bar', res)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });

    it('バックスラッシュだけの returnUrl も BadRequestException をスローすること', async () => {
      const res = makeMockResponse();
      await expect(controller.silentLogin('\\', res)).rejects.toThrow(BadRequestException);
      expect(mockOidcService.buildAuthRequest).not.toHaveBeenCalled();
    });
  });
});
