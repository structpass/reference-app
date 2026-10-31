import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validateDatabasePoolLimits } from './common/config/env-validation';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
];

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in all required values.',
    );
  }

  // .env.example の placeholder（CHANGE_ME_ 接頭辞）のまま起動するのを防ぐ（secret 流出防止）。
  const PLACEHOLDER_SECRETS = ['JWT_SECRET', 'OIDC_CLIENT_SECRET', 'INTEGRATION_SERVICE_TOKEN'];
  for (const key of PLACEHOLDER_SECRETS) {
    if ((process.env[key] ?? '').startsWith('CHANGE_ME')) {
      throw new Error(
        `${key} is still set to the .env.example placeholder value. ` +
          'Replace it with a real secret before starting the server.',
      );
    }
  }

  if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters in production. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    );
  }

  // INTEGRATION_SERVICE_TOKEN（機械認証の共有 credential・ref-0095）。
  // 未設定時は起動を止めず、受口（ServiceTokenGuard）側が fail-closed で常に拒否する（criteria【3】の「無効化」）。
  // 値が入っている時だけ、本番は最小長を検査する（placeholder 検出は上記 PLACEHOLDER_SECRETS が担う）。
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.INTEGRATION_SERVICE_TOKEN?.length ?? 0) > 0 &&
    (process.env.INTEGRATION_SERVICE_TOKEN?.length ?? 0) < 32
  ) {
    throw new Error(
      'INTEGRATION_SERVICE_TOKEN must be at least 32 characters in production. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    );
  }

  // OIDC post-login redirect 先は CORS_ORIGIN（許可 origin という別の関心事）に流用させない。
  // production で未設定のまま起動を許すと、設定漏れ/typo 時に開発用 origin へ redirect し続ける
  // phishing の起点になり得るため fail-closed にする（dev は frontendBase() 側で CORS_ORIGIN へ fallback）。
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.OIDC_FRONTEND_URL ?? '').trim().length === 0
  ) {
    throw new Error(
      'OIDC_FRONTEND_URL must be set in production. ' +
        'It is the OIDC post-login redirect origin and must not fall back to CORS_ORIGIN.',
    );
  }

  // OIDC_FRONTEND_URL が設定されている場合は値を検証する（rete-auth-0010 item3）。
  // protocol-relative `//host`・scheme 無し・userinfo `user@evil.com`（redirect 先 host 偽装）など、
  // 設定ミスで off-origin redirect になる形を起動時に弾く（production/dev 問わず）。空（dev 未設定）は
  // 上の production ガードに委ね、ここでは値がある時だけ検査する。単純な前方一致 regex は userinfo 混入を
  // 見逃すため、WHATWG URL でパースして protocol と userinfo を検証する。
  const frontendUrl = (process.env.OIDC_FRONTEND_URL ?? '').trim();
  if (frontendUrl.length > 0) {
    let parsed: URL;
    try {
      parsed = new URL(frontendUrl);
    } catch {
      throw new Error(`OIDC_FRONTEND_URL must be an absolute http(s) URL (got: ${frontendUrl}).`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `OIDC_FRONTEND_URL must start with http:// or https:// (got: ${frontendUrl}).`,
      );
    }
    if (parsed.username || parsed.password) {
      throw new Error(
        `OIDC_FRONTEND_URL must not contain userinfo (user:pass@host) (got: ${frontendUrl}).`,
      );
    }
  }
}

// リバースプロキシ（Caddy）1 段配下でのみ TRUST_PROXY=true で有効化（任意・既定 off）。
// 有効時は trust proxy hops=1 固定で、レート制限（ThrottlerGuard）を実クライアント IP 単位にする。
// 直結起動（開発）で有効のままだと偽の X-Forwarded-For で制限回避が可能になるため true 固定判定
// （CIDR 等の自由値は受け付けない・ref-0062）。
// env ゲート（`=== 'true'`）は受入基準の中心なので export して unit テストで固定する
// （main.spec.ts・e2e もこの関数を呼ぶ = 分岐の複製を持たない）。
export function applyTrustProxy(app: INestApplication, rawValue: string | undefined): boolean {
  const enabled = rawValue === 'true';
  if (enabled) {
    // 誤って直結環境で true にした場合に無警告で IP 偽装が可能になるため、有効化をログで可視化する。
    new Logger('Bootstrap').warn('trust proxy enabled (hops=1) — verify reverse proxy topology');
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  return enabled;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  validateEnv();

  // 接続プールの上限（ref-0071・rete cmn-0251 の移植）。テンプレート（.env.example）に書くだけでは
  // 既存の .env / compose へ伝播しないため、実際の接続文字列を起動時に見る。本番は fail-fast
  // （枯渇がログインまで巻き込むため）、dev / test は warn に留める（手元の起動を止めない）。
  const poolProblem = validateDatabasePoolLimits(process.env.DATABASE_URL);
  if (poolProblem) {
    if (process.env.NODE_ENV === 'production') throw new Error(poolProblem);
    logger.warn(poolProblem);
  }

  const app = await NestFactory.create(AppModule);

  applyTrustProxy(app, process.env.TRUST_PROXY);

  // セキュリティヘッダー
  app.use(helmet());

  // Cookie解析（OIDC state cookie の署名検証に JWT_SECRET を流用し env を増やさない）
  app.use(cookieParser(process.env.JWT_SECRET));

  // CORS設定（カンマ区切りで複数オリジン対応）
  const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());
  const corsOrigin: CustomOrigin = (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  };
  app.enableCors({ origin: corsOrigin, credentials: true });

  // グローバルバリデーションパイプ
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // APIプレフィックス
  app.setGlobalPrefix('api/v1');

  // Swagger 公開条件: NODE_ENV != production がデフォルト。
  // staging などで NODE_ENV=production としつつ Swagger を開けたい場合は SWAGGER_ENABLED=true を明示。
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Struct Pass API')
      .setDescription('商品管理システム REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    logger.log(`Swagger documentation: http://localhost:${process.env.PORT || 3001}/api`);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

// main.spec.ts が validateEnv() を import しても bootstrap（NestFactory.create → listen）が
// 走らないよう、直接起動された時のみ bootstrap する（rete-auth-0010 item1: validateEnv 単体テスト用）。
if (require.main === module) {
  void bootstrap();
}
