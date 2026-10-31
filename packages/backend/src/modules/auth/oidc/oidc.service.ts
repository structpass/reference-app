import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as client from 'openid-client';

/**
 * rete（OIDC IdP）に対する RP として、Authorization Code Flow（PKCE + state + nonce）を実行する。
 *
 * 設計（spec §3.3 / §6）:
 * - rete を identity の Single Source of Truth とし、reference は OIDC token を**初回認証時のみ**消費する。
 * - 以降のセッションは reference 自前の JWT/cookie（{@link AuthService.issueJwt}）で回す。
 * - openid-client は ESM-only（v6）。本 service 経由でのみ参照し、unit test では `jest.mock('openid-client')` する。
 */
export interface OidcClaims {
  sub: string;
  email: string;
  name: string;
}

export interface OidcAuthRequest {
  /** rete /authorize への遷移先 URL */
  url: string;
  /** callback で検証するため署名 cookie に退避する値 */
  state: string;
  nonce: string;
  codeVerifier: string;
  /** silent フロー（`prompt=none`）か。通常ログインは false */
  silent: boolean;
  /** silent フロー時の戻り先（FE 側パス）。callback 成功時にリダイレクト */
  returnUrl?: string;
}

/**
 * buildAuthRequest に渡せる追加パラメータ。
 * - silent=true のとき `prompt=none` を付与し rete セッション生存を問い合わせる。
 *   rete セッション切れなら callback 失敗→通常の login へ落ちる（無限ループ抑止）。
 * - returnUrl は silent 用。silent 成功時に FE が元いたページへ戻る。
 */
export interface BuildAuthRequestOptions {
  silent?: boolean;
  returnUrl?: string;
}

// discovery 失敗直後の連打抑止 TTL（rete-auth-0006: DoS amplifier 対策）。
const DISCOVERY_NEGATIVE_CACHE_TTL_MS = 5000;

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  // discovery 結果（Configuration）を 1 度だけ取得してキャッシュ。失敗時は null に戻し次回再試行を許す。
  private configPromise: ReturnType<typeof client.discovery> | null = null;
  // 直近の discovery 失敗（negative cache）。TTL 内の再呼び出しは discovery を起動せずこれを再 throw する。
  private lastDiscoveryFailure: { error: unknown; failedAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get redirectUri(): string {
    return this.configService.getOrThrow<string>('OIDC_REDIRECT_URI');
  }

  private getConfig(): ReturnType<typeof client.discovery> {
    if (!this.configPromise) {
      if (
        this.lastDiscoveryFailure &&
        Date.now() - this.lastDiscoveryFailure.failedAt < DISCOVERY_NEGATIVE_CACHE_TTL_MS
      ) {
        // TTL 内は discovery を起動せず直前の失敗を再 throw（rete 障害中の連打を防ぐ）。
        this.logger.warn('OIDC discovery: negative cache 内のため再試行をスキップ');
        return Promise.reject(this.lastDiscoveryFailure.error);
      }
      this.configPromise = this.discover()
        .then((config) => {
          this.lastDiscoveryFailure = null;
          return config;
        })
        .catch((err) => {
          // 失敗を永続キャッシュしない（rete 復帰後に再 discovery 可能にする・operational-policy §依存障害）。
          // ただし TTL 内の連打だけは negative cache で防ぐ。
          this.configPromise = null;
          this.lastDiscoveryFailure = { error: err, failedAt: Date.now() };
          throw err;
        });
    }
    return this.configPromise;
  }

  private discover(): ReturnType<typeof client.discovery> {
    const issuer = this.configService.getOrThrow<string>('OIDC_ISSUER');
    const clientId = this.configService.getOrThrow<string>('OIDC_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('OIDC_CLIENT_SECRET');
    const issuerUrl = new URL(issuer);
    // dev では rete issuer が http のため HTTPS 強制を外す。production は https 必須のまま維持。
    // ただし LAN 越しの http issuer（例: 192.168.x.x）でも通ってしまうと PKCE verifier を sniff される
    // 余地が出るので、loopback（localhost / 127.0.0.1 / IPv6 [::1]）のみに限定する
    // （rete 以外の LAN 経由 dev は .env を https 化する）。
    // WHATWG URL は IPv6 host を `new URL('http://[::1]:3011').hostname === '[::1]'`（ブラケット付き）で
    // 返すため、比較前にブラケットを剥がす。[::1] は 127.0.0.1 と同じ自ホスト loopback なので、既存の
    // 127.0.0.1 許可と等価に dev insecure 許可対象に含める（L-1/L-5）。
    const issuerHost = issuerUrl.hostname.replace(/^\[|\]$/g, '');
    const isLocalIssuer =
      issuerHost === 'localhost' || issuerHost === '127.0.0.1' || issuerHost === '::1';
    const allowInsecure =
      process.env.NODE_ENV !== 'production' && issuerUrl.protocol === 'http:' && isLocalIssuer;
    const options = allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined;
    this.logger.log(
      `OIDC discovery: ${issuerUrl.origin}${allowInsecure ? ' (insecure allowed, localhost only)' : ''}`,
    );
    return client.discovery(issuerUrl, clientId, clientSecret, undefined, options);
  }

  /**
   * ログイン開始: PKCE/state/nonce を生成し、rete /authorize への URL を組み立てる。
   *
   * silent=true を渡すと `prompt=none` を付与し、rete セッションが生きていれば
   * callback まで無瞬断で再認証できるフローになる（silent SSO）。controller は silent 成功時に
   * 別途保存済みの returnUrl へリダイレクトする責務を持つ。
   */
  async buildAuthRequest(options: BuildAuthRequestOptions = {}): Promise<OidcAuthRequest> {
    const config = await this.getConfig();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    // openid-client v6 の buildAuthorizationUrl は Record<string, string> | URLSearchParams を受ける。
    // 型は公開エクスポートされていないので Record で組み、prompt は silent 時のみ追加する。
    const params: Record<string, string> = {
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    };
    if (options.silent) {
      // OIDC §3.1.2.1 prompt=none: IdP セッション切れなら error=login_required で callback に戻る。
      // controller 側はこのエラーを通常の login へフォールバックさせる（無限ループ防止）。
      params.prompt = 'none';
    }
    const url = client.buildAuthorizationUrl(config, params);
    return {
      url: url.href,
      state,
      nonce,
      codeVerifier,
      silent: !!options.silent,
      returnUrl: options.returnUrl,
    };
  }

  /**
   * callback: code を token 交換し、profile claims（sub/email/name）を取り出す。
   * state / nonce / PKCE の整合は openid-client が検証する（不一致は throw）。
   *
   * email/name は **UserInfo endpoint** から取得する。rete（oidc-provider）は OIDC 安全既定
   * （conformIdTokenClaims）により、access_token を発行する code flow では profile/email を
   * id_token に載せず UserInfo でのみ返す。そのため id_token の claims だけでは email が空になり、
   * 空 email で User を作って unique 衝突する（spec §4.1）。
   */
  async handleCallback(
    callbackUrl: URL,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<OidcClaims> {
    const config = await this.getConfig();
    // RFC 9207（iss mix-up 防御）: callback の `iss` は openid-client v6 が authorizationCodeGrant →
    // oauth4webapi.validateAuthResponse 内で discovery 済み as.issuer と自動照合する（present なら一致必須、
    // AS が authorization_response_iss_parameter_supported を出すなら iss 自体が必須）。controller が iss を
    // allow-list に載せて callbackUrl へ転送するのは、この自動検証へ iss を届けるため。
    // v6 の AuthorizationCodeGrantChecks に expectedIssuer オプションは無く、明示指定は不要
    // （渡すと excess-property の型エラー）。
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub) {
      throw new InternalServerErrorException('OIDC id_token に sub claim がありません');
    }
    if (!tokens.access_token) {
      // UserInfo は Bearer access_token が必須。code flow では必ず返るが、欠落時は loud に失敗させる。
      throw new InternalServerErrorException('OIDC token 応答に access_token がありません');
    }
    // sub の一致は fetchUserInfo が検証する（userinfo.sub !== expectedSubject なら throw）。
    const userInfo = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
    const email = typeof userInfo.email === 'string' ? userInfo.email.trim() : '';
    if (!email) {
      // email が取れない＝空 User 生成 → email unique 衝突の温床。loud に失敗させる（spec §4.1）。
      throw new InternalServerErrorException('OIDC UserInfo に email claim がありません');
    }
    // name claim 欠落時は email を表示名に流用（spec §4.1）。
    const name =
      typeof userInfo.name === 'string' && userInfo.name.trim().length > 0 ? userInfo.name : email;
    return { sub: claims.sub, email, name };
  }
}
