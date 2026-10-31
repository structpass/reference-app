// main.ts → AppModule → OidcService は ESM-only の openid-client を import する。jest(CJS) が実体を
// parse できず「Cannot use import statement outside a module」で落ちるため、oidc spec と同型で factory
// モックし実体ロードを避ける（validateEnv() 単体テストに openid-client 実体は不要）。
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

import { validateEnv, applyTrustProxy } from './main';

/**
 * validateEnv() の fail-closed / scheme 検証テスト（rete-auth-0010）。
 *
 * validateEnv() は process.env を直接読むため、各テストで必須 env を満たした clean な状態を組み、
 * NODE_ENV / OIDC_FRONTEND_URL のみを差し替えて振る舞いを検証する。
 * （main.ts の bootstrap() は `require.main === module` ガードで import 時に走らない）
 */
describe('validateEnv (rete-auth-0010)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgres://localhost:5432/db',
      JWT_SECRET: 'x'.repeat(40),
      OIDC_ISSUER: 'http://localhost:3011',
      OIDC_CLIENT_ID: 'reference',
      OIDC_CLIENT_SECRET: 'reference-secret',
      OIDC_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/oidc/callback',
    };
    delete process.env.OIDC_FRONTEND_URL;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('OIDC_FRONTEND_URL fail-closed (production)', () => {
    it('production + OIDC_FRONTEND_URL 未設定 → throw', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.OIDC_FRONTEND_URL;
      expect(() => validateEnv()).toThrow(/OIDC_FRONTEND_URL must be set in production/);
    });

    it('production + OIDC_FRONTEND_URL が空白のみ → throw', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = '   ';
      expect(() => validateEnv()).toThrow(/OIDC_FRONTEND_URL must be set in production/);
    });

    it('production + OIDC_FRONTEND_URL 設定済（https） → 通過', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'https://sso.example.com';
      expect(() => validateEnv()).not.toThrow();
    });

    it('dev + OIDC_FRONTEND_URL 未設定 → 通過（CORS_ORIGIN fallback 前提）', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OIDC_FRONTEND_URL;
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe('OIDC_FRONTEND_URL scheme 検証 (item3)', () => {
    // scheme 検証は production/dev 共通で起動を拒否する（dev でも設定ミス＝off-origin redirect の起点）。
    // 単純な `^https?://` 前方一致 regex は userinfo 偽装（https://user@evil.com）で host が別 origin に
    // 化ける経路を素通りさせるため、WHATWG `new URL()` で parse して protocol と userinfo を検証する
    // （security-reviewer MEDIUM・rete-auth-0010）。

    it('protocol-relative（//attacker.example） → throw（new URL() が TypeError を投げる）', () => {
      process.env.NODE_ENV = 'development';
      process.env.OIDC_FRONTEND_URL = '//attacker.example';
      expect(() => validateEnv()).toThrow(/must be an absolute http\(s\) URL/);
    });

    it('scheme 無しの素ホスト（sso.example.com） → throw（new URL() が TypeError を投げる）', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'sso.example.com';
      expect(() => validateEnv()).toThrow(/must be an absolute http\(s\) URL/);
    });

    it('javascript: scheme → throw（http/https 以外）', () => {
      process.env.NODE_ENV = 'development';
      process.env.OIDC_FRONTEND_URL = 'javascript:alert(1)';
      expect(() => validateEnv()).toThrow(/must start with http:\/\/ or https:\/\//);
    });

    it('data: scheme → throw（http/https 以外）', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'data:text/html,<script>alert(1)</script>';
      expect(() => validateEnv()).toThrow(/must start with http:\/\/ or https:\/\//);
    });

    it('userinfo 付き（https://user@evil.com） → throw（off-origin redirect の host 偽装経路）', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'https://user@evil.com';
      expect(() => validateEnv()).toThrow(/must not contain userinfo/);
    });

    it('userinfo:password 付き（https://user:pass@evil.com） → throw', () => {
      process.env.NODE_ENV = 'development';
      process.env.OIDC_FRONTEND_URL = 'https://user:pass@evil.com';
      expect(() => validateEnv()).toThrow(/must not contain userinfo/);
    });

    it('http:// で始まる → 通過', () => {
      process.env.NODE_ENV = 'development';
      process.env.OIDC_FRONTEND_URL = 'http://localhost:3000';
      expect(() => validateEnv()).not.toThrow();
    });

    it('https:// で始まる → 通過', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'https://sso.example.com';
      expect(() => validateEnv()).not.toThrow();
    });

    it('サブパス付き（https://sso.example.com/app） → 通過（frontend がサブパス配下でも正しく redirect できる形）', () => {
      process.env.NODE_ENV = 'production';
      process.env.OIDC_FRONTEND_URL = 'https://sso.example.com/app';
      expect(() => validateEnv()).not.toThrow();
    });

    it('backslash 入り（https://\\\\attacker.example）→ new URL() が \\ を / に正規化して host=attacker.example として受理（operator 明示設定）', () => {
      // 注: これで防げないのは「operator が意図的に attacker.example を設定した」設定ミスのみ。
      // attacker.example 自体は https として妥当な host なので new URL() は host 偽装として弾けない。
      // 真の mitigation は item2 (frontendBase production fail-closed) + CORS_ORIGIN allow-list + 監視。
      // 本テストは正規化挙動を pin して将来 library 変更時の回帰検知にする目的。
      process.env.NODE_ENV = 'development';
      process.env.OIDC_FRONTEND_URL = 'https://\\attacker.example';
      expect(() => validateEnv()).not.toThrow();
    });
  });
});

/**
 * applyTrustProxy() の env ゲート（ref-0062）。
 *
 * criteria 3（true 固定・自由値非受理）が受け入れ基準の中心のため、`=== 'true'` 比較を
 * ここで固定する。e2e（throttle.e2e-spec.ts）もこの関数を呼ぶ = 分岐の複製を持たない。
 */
describe('applyTrustProxy (ref-0062)', () => {
  function createMockApp() {
    const set = jest.fn();
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ set }) }),
    } as unknown as Parameters<typeof applyTrustProxy>[0];
    return { app, set };
  }

  it("'true' → 有効化: hops=1 を設定し true を返す", () => {
    const { app, set } = createMockApp();
    expect(applyTrustProxy(app, 'true')).toBe(true);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('未設定（undefined）→ 無効: 何も設定せず false', () => {
    const { app, set } = createMockApp();
    expect(applyTrustProxy(app, undefined)).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("'1' → 無効（true 固定・CIDR 等の自由値は非受理）", () => {
    const { app, set } = createMockApp();
    expect(applyTrustProxy(app, '1')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("'TRUE' → 無効（大文字は受理しない）", () => {
    const { app, set } = createMockApp();
    expect(applyTrustProxy(app, 'TRUE')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});

/**
 * validateEnv() の INTEGRATION_SERVICE_TOKEN 検証（ref-0095）。
 *
 * criteria【3】の「CHANGE_ME_ placeholder のままの値による本番起動が弾かれる」と、
 * criteria【6】の「env 未設定時（受口無効化）でも起動は通る」を pin する。
 * 検証は main.spec.ts が validateEnv() を既に専有しているため同ファイルに同居させる
 * （validateEnv 単体テストは openid-client を mock する前提でここに集約）。
 */
describe('validateEnv INTEGRATION_SERVICE_TOKEN (ref-0095)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgres://localhost:5432/db',
      JWT_SECRET: 'x'.repeat(40),
      OIDC_ISSUER: 'http://localhost:3011',
      OIDC_CLIENT_ID: 'reference',
      OIDC_CLIENT_SECRET: 'reference-secret',
      OIDC_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/oidc/callback',
      OIDC_FRONTEND_URL: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('placeholder（CHANGE_ME_ 接頭辞）のまま → throw', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'CHANGE_ME_something';
    expect(() => validateEnv()).toThrow(
      /INTEGRATION_SERVICE_TOKEN is still set to the .env.example placeholder/,
    );
  });

  it('未設定（dev）→ 通過（受口は fail-closed で無効化・criteria【3】）', () => {
    delete process.env.INTEGRATION_SERVICE_TOKEN;
    expect(() => validateEnv()).not.toThrow();
  });

  it('未設定（production）→ 通過（受口は fail-closed で無効化・起動は許す）', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTEGRATION_SERVICE_TOKEN;
    expect(() => validateEnv()).not.toThrow();
  });

  it('本番 + 32 文字未満 → throw（最小長検査）', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTEGRATION_SERVICE_TOKEN = 'short-token';
    expect(() => validateEnv()).toThrow(/INTEGRATION_SERVICE_TOKEN must be at least 32 characters/);
  });

  it('本番 + 32 文字以上 → 通過', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTEGRATION_SERVICE_TOKEN = 'a'.repeat(32);
    expect(() => validateEnv()).not.toThrow();
  });

  it('dev + 短い値 → 通過（最小長は本番のみ）', () => {
    process.env.INTEGRATION_SERVICE_TOKEN = 'short-token';
    expect(() => validateEnv()).not.toThrow();
  });
});
