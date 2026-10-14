import { BadRequestException, Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Public } from '../../../common/decorators';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { AUTH_COOKIE_NAME, getCookieOptions } from '../constants/cookie.constants';
import { OidcService } from './oidc.service';
import { OIDC_STATE_COOKIE_NAME, getOidcStateCookieOptions } from './oidc-state.cookie';

interface OidcStateCheck {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** silent フロー（prompt=none）か。callback の遷移先決定に使う */
  silent?: boolean;
  /** silent フロー時の戻り先。同一 origin のパスのみ許容（sanitizeReturnUrl 経由） */
  returnUrl?: string;
}

/**
 * silent-login がクエリで受け取る returnUrl のサニタイズ。
 *
 * なぜ必要か: silent-login は任意の returnUrl を受け取り state cookie に乗せる。
 * これを無検証で callback の redirect 先として使えば open redirect フィッシングの踏み台になる
 * （攻撃者が `?return=https://evil.example.com` を踏ませて external login 画面を出せる）。
 * 加えて /login を戻り先に許すと 401 → silent-login → /login の無限ループが発生する。
 *
 * 許可する形: pathname 形式の path。先頭 `/` 必須、長さ上限、改行/制御文字拒否。
 * 拒否する形: scheme 付き絶対 URL、`//` 始まりの protocol-relative、空文字、`/login` 系、過大長、
 * 非 string 型（配列/オブジェクト・rete-auth-0009 L-2）、危険文字 `<>"'` ` を含むもの（rete-auth-0009 M-1）。
 *
 * 部分パース失敗時は保守的に拒否（許可は最小限）。
 */
function sanitizeReturnUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Express qs は `?return=/a&return=/b`（配列）や `?return[x]=y`（オブジェクト）を非文字列として
  // パースする。文字列前提の処理（.length/.startsWith 等）へ流すと TypeError で 500 化するため、
  // ここで弾いて呼び元の 400 経路（BadRequestException）に合流させる（rete-auth-0009 L-2）。
  if (typeof raw !== 'string') return undefined;
  if (raw.length > 2048) return undefined; // DoS 上限
  // 改行・制御文字は header injection 経路なので拒否
  if (/[\r\n\t\0]/.test(raw)) return undefined;
  // バックスラッシュを拒否（ブラウザが `\` を `/` として再解釈する経路の多層防御。
  // sanitize-url 系ライブラリでも一般的な拒否パターン。open-redirect 対策の二重掛け）。
  // 注: 対象は生の `\` のみ。%5C（URLエンコード済みバックスラッシュ）はこのチェックでは
  // 素通りするが、モダンブラウザは %5C を `\` として再解釈しないため実害はない（rete-auth-0009 L-4）。
  if (/\\/.test(raw)) return undefined;
  // scheme 付き絶対 URL を拒否（例 http://, https:, javascript:, data:）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return undefined;
  // protocol-relative を拒否（例 //evil.com/）
  if (raw.startsWith('//')) return undefined;
  // path 形強制
  if (!raw.startsWith('/')) return undefined;
  // fragment に危険文字（HTMLタグ/属性を壊せる文字）が混ざる戻り先を拒否。Location ヘッダの
  // fragment は HTML に反映されないが、reference 側のページが window.location.hash を
  // innerHTML 等の sink に流す将来変更に備えた多層防御（rete-auth-0009 M-1）。
  // denylist（危険文字だけ拒否）を採用：allowlist だと空白入りクエリ（?q=hello world 等）の
  // 正当な復帰を壊す副作用があるため。
  if (/[<>"'`]/.test(raw)) return undefined;
  // fragment（# 以降）に scheme 付き文字列（javascript:/data: 等）が混入する経路も拒否。
  // 上のタグ/属性破壊 denylist は innerHTML 系 sink 向けの多層防御だが、window.location.hash を
  // 将来 location.href 代入や <a href> 系の navigation sink に使うケースには scheme インジェクション
  // が別途効くため、fragment 部分にも scheme 検出を及ぼす（security-reviewer 指摘・rete-auth-0009 M-1）。
  const hashIndex = raw.indexOf('#');
  if (hashIndex !== -1 && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw.slice(hashIndex + 1))) {
    return undefined;
  }
  // /login 系を拒否（FE 401 interceptor が /login で silent-login を再発火しない構造の二段目の安全弁）。
  // 大文字小文字・fragment/space 変種（/Login, /LOGIN, /login#x 等）も frontend
  // （pathname.toLowerCase() 済み）と挙動を揃えるため、query/fragment を除いた path 部分を
  // 小文字化してから判定する（rete-auth-0009 L-1）。
  const lowerPath = raw.toLowerCase().split(/[?#]/)[0];
  if (lowerPath === '/login' || lowerPath.startsWith('/login/')) {
    return undefined;
  }
  return raw;
}

/**
 * OIDC RP のブラウザ向けエンドポイント（spec §3.3）。
 *
 * - `GET auth/oidc/login`: PKCE/state/nonce を発行 → 署名 cookie に退避 → rete /authorize へ 302。
 * - `GET auth/oidc/silent-login?return=<path>`: silent SSO 用。`prompt=none` 付きで rete に問い合わせ、
 *   成功時に returnUrl へ戻す。IdP セッション切れは callback 失敗経由で /login へ落ちる。
 * - `GET auth/oidc/callback`: code→token 交換 → JIT プロビジョニング → reference 自前 JWT を cookie 発行 →
 *   role 有無で frontend へ振り分け（pending は権限待ち画面）。silent フロー成功時は returnUrl へ。
 *
 * 注（§4 例外）: 通常はエラーを ExceptionFilter で一元処理するが、callback はブラウザの top-level
 * ナビゲーションのため JSON エラーを返すと生 JSON が画面に出る。OIDC 由来のエラーは握って
 * frontend の login?error=sso へ redirect する（standard RP 実装）。想定外の例外のみ filter に委ねる。
 */
@ApiTags('auth-oidc')
@Controller('auth/oidc')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidcService: OidcService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  @Public()
  @ApiOperation({ summary: 'SSO ログイン開始（rete /authorize へ redirect）' })
  async login(@Res() res: Response): Promise<void> {
    const authReq = await this.oidcService.buildAuthRequest();
    const payload: OidcStateCheck = {
      state: authReq.state,
      nonce: authReq.nonce,
      codeVerifier: authReq.codeVerifier,
    };
    res.cookie(OIDC_STATE_COOKIE_NAME, JSON.stringify(payload), getOidcStateCookieOptions());
    res.redirect(authReq.url);
  }

  /**
   * silent SSO 再認証（prompt=none）。401 等の JWT 切れ検知時に FE からトップレベル遷移で呼ばれる。
   *
   * - `?return=<path>` で戻り先（path のみ・同一 origin）を受け取り state cookie に保存。
   *   callback 成功時にそこへ遷移する。
   * - rete セッションも切れている場合、callback は `catch` 経路で /login?error=sso へ落ちる。
   *   FE 401 interceptor が /login では silent-login を再発火しないので無限ループしない（二段目の安全弁は
   *   sanitizeReturnUrl で returnUrl に /login 系を許さないこと）。
   * - returnUrl が欠落/不正な場合は silent SSO の旨味が無いので 400。
   */
  @Get('silent-login')
  @Public()
  @ApiOperation({
    summary: 'silent SSO 再認証（prompt=none・元ページ復帰）',
  })
  async silentLogin(
    @Query('return') returnUrl: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const safe = sanitizeReturnUrl(returnUrl);
    if (!safe) {
      throw new BadRequestException(
        'silent-login には同一 origin の path を ?return= で指定してください',
      );
    }
    const authReq = await this.oidcService.buildAuthRequest({ silent: true, returnUrl: safe });
    const payload: OidcStateCheck = {
      state: authReq.state,
      nonce: authReq.nonce,
      codeVerifier: authReq.codeVerifier,
      silent: true,
      returnUrl: safe,
    };
    res.cookie(OIDC_STATE_COOKIE_NAME, JSON.stringify(payload), getOidcStateCookieOptions());
    res.redirect(authReq.url);
  }

  /**
   * OIDC callback で受け付ける query キーの allow-list。
   *
   * なぜ限定するか: req.query を無条件に callback URL へ転送すると、
   * (a) OIDC と無関係な任意キーまで callback URL に載って downstream（openid-client の
   *     validateAuthResponse 等）へ渡り、不透明な失敗経路や rate-limit 踏み台化の余地が生まれる、
   * (b) Express の qs 既定 parser は `?code[a]=1` を `{ code: { a: '1' } }`、`?code=1&code=2` を
   *     `['1','2']` のように非 string へ parse する（silent drop ではなく型が変わる）。これを検知せず
   *     `.searchParams.set` 等の string 前提処理へ流すと不定形の失敗になる。
   * OIDC callback で実際に使う (code/state/error/error_description/error_uri/iss) のみに絞り、
   * allow-list 外キーは転送前に捨て、allow-list 内の非 string 値は明示的に 400 で fail-loud させる。
   *
   * error_uri は OIDC Core §3.1.2.6 の error response 3 パラメータの 1 つ。controller では
   * redirect/render に使わず security-relevant ではないが、spec completeness として含める（M-4）。
   */
  private static readonly ALLOWED_CALLBACK_QUERY_KEYS = new Set([
    'code',
    'state',
    'error',
    'error_description',
    'error_uri',
    'iss',
  ]);

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'OIDC callback（code→token→JIT→自前 JWT cookie）' })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const frontend = this.frontendBase();
    const raw = req.signedCookies?.[OIDC_STATE_COOKIE_NAME] as string | undefined;
    // state cookie は使い切り。成否に関わらず破棄する。
    res.clearCookie(OIDC_STATE_COOKIE_NAME, getOidcStateCookieOptions());

    // allow-list 外の query は転送対象外として skip し、allow-list 内の非 string 値は
    // try/catch の外で 400 として明示的に fail-loud させる（不定形の型で downstream を汚さない・L-4）。
    // この 400（BadRequestException）は redirect を伴わず JSON を返すため、下の redirect 経路で掛ける
    // Referrer-Policy: no-referrer は不要（Referer 漏えい経路が無い・意図的な非対称・L-3）。
    // OIDC 由来エラー（state mismatch 等）は下の try/catch で /login?error=sso へ倒す。
    for (const [key, value] of Object.entries(req.query)) {
      if (!OidcController.ALLOWED_CALLBACK_QUERY_KEYS.has(key)) continue;
      if (typeof value !== 'string') {
        throw new BadRequestException(`OIDC callback query \`${key}\` must be a string`);
      }
    }

    try {
      if (!raw) {
        throw new Error('OIDC state cookie missing (session expired or CSRF)');
      }
      const checks = JSON.parse(raw) as OidcStateCheck;
      // silent フローは state を「silent=true で発行した callback か」だけ判定。
      // returnUrl は controller 側で sanitize 済みなのでここでも信用する（cookie 改竄は signed:true で破棄）。
      const callbackUrl = new URL(this.configService.getOrThrow<string>('OIDC_REDIRECT_URI'));
      for (const [key, value] of Object.entries(req.query)) {
        if (!OidcController.ALLOWED_CALLBACK_QUERY_KEYS.has(key)) continue;
        if (typeof value === 'string') {
          callbackUrl.searchParams.set(key, value);
        }
      }

      const claims = await this.oidcService.handleCallback(callbackUrl, checks);
      const user = await this.usersService.provisionFromOidc(claims);
      const accessToken = this.authService.issueJwt(user);
      res.cookie(AUTH_COOKIE_NAME, accessToken, getCookieOptions());

      // 戻り先決定:
      // 1) silent 成功 & returnUrl 保存済 → 元ページへ
      // 2) role 未割当 (pending) → 権限待ち画面
      // 3) 通常 → 着地ページ /home（FE '/' は未認証前提で /login へ飛ばすため /home 直指し・dashboard-0006）
      let target: string;
      if (checks.silent && checks.returnUrl) {
        target = `${frontend}${checks.returnUrl}`;
      } else if (!user.role) {
        target = `${frontend}/pending`;
      } else {
        target = `${frontend}/home`;
      }
      // 302 のレスポンス自体に Referrer-Policy を付け、次のナビゲーションで backend URL
      // （/callback?code=...&state=...）が Referer として送出されないようにする。ブラウザ既定の
      // strict-origin-when-cross-origin でも origin のみ送る形だが、frontend 側に 3rd-party widget
      // / analytics を追加する時点で code を含む full URL が漏れる余地があるため、ここで
      // no-referrer に固定して defense-in-depth を取る（code 短命＋PKCE binding で実害は限定的だが、
      // 着手が軽い今に塞ぐ方が拡張時に無用な検討を払える）。
      this.setReferrerPolicyNoReferrer(res);
      res.redirect(target);
    } catch (err) {
      // openid-client の生 message/stack は log 集約先への PII/内部情報混入源になるため
      // エラー種別（Error.name ＝ 例: AuthorizationResponseError, ResponseBodyError）のみ記録する。
      this.logger.warn(`OIDC callback failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
      // silent 失敗時も /login?error=sso へ。FE 401 interceptor が /login では自動 silent-login を
      // 発火しないので無限ループしない。
      this.setReferrerPolicyNoReferrer(res);
      res.redirect(`${frontend}/login?error=sso`);
    }
  }

  /**
   * 302 応答に Referrer-Policy: no-referrer を設定する。
   * 詳細: callback のコメントブロック参照。
   */
  private setReferrerPolicyNoReferrer(res: Response): void {
    if (!res.getHeader('Referrer-Policy')) {
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
  }

  /**
   * post-login の redirect 先（frontend オリジン）。
   * OIDC_FRONTEND_URL を優先し、未設定時のみ CORS_ORIGIN の先頭値へ fallback する（dev 後方互換）。
   * production は main.ts の validateEnv() が OIDC_FRONTEND_URL 未設定を起動時に拒否する
   * （rete-auth-0007: CORS_ORIGIN 流用時の phishing origin フォールバックを解消）。加えて本メソッド自身も
   * production では fail-closed に throw し（rete-auth-0010 item2: 多層防御）、validateEnv() を経由しない
   * 起動経路（別 entrypoint・テスト bootstrap 等）が将来生まれても単一障害点を残さない。
   */
  private frontendBase(): string {
    const dedicated = (this.configService.get<string>('OIDC_FRONTEND_URL') ?? '').trim();
    if (dedicated) {
      return this.stripTrailingSlash(dedicated);
    }
    // fail-closed の多層防御（rete-auth-0010 item2）: production で OIDC_FRONTEND_URL 未設定なら
    // CORS_ORIGIN へフォールバックせず throw する（validateEnv() と同条件・単一障害点の排除）。
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OIDC_FRONTEND_URL must be set in production (frontendBase fail-closed).');
    }
    // dev のみ: CORS_ORIGIN の先頭値へ fallback（後方互換）。
    const cors = this.configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
    return this.stripTrailingSlash(cors.split(',')[0].trim());
  }

  /**
   * 末尾スラッシュを除去する（rete-auth-0010 item4）。
   * `http://x.com/` + `/home` → `http://x.com//home` の二重スラッシュ redirect を防ぐ。
   */
  private stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }
}
